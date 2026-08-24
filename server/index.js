import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { query, pool } from './db.js';
import { createToken, requireAdmin } from './auth.js';
import { s3Enabled, putImage, deleteImageByUrl } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 8788);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.set('trust proxy', 1);

const allowedOrigins = FRONTEND_ORIGIN.split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin не разрешен'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const localStorageEngine = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage: s3Enabled() ? multer.memoryStorage() : localStorageEngine,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Можно загружать только изображения'));
    cb(null, true);
  }
});



async function ensureBaseSchema() {
  const schemaPath = path.resolve(__dirname, '../database/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await query(schemaSql);
}

async function ensureInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;

  const { rows } = await query(`select id from admins where lower(email)=lower($1) limit 1`, [email]);
  if (rows.length) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await query(`insert into admins(email,password_hash) values($1,$2)`, [email,passwordHash]);
  console.log('Initial admin created:', email);
}

async function ensureProductImagesSchema() {
  await query(`alter table products add column if not exists images jsonb not null default '[]'::jsonb`);
}

async function ensureProductSpecsSchema() {
  await query(`alter table products add column if not exists specs jsonb not null default '{}'::jsonb`);
}


async function ensureDigitSyncSchema() {
  await query(`
    alter table products add column if not exists digit_product_id text;
    alter table products add column if not exists sync_source text not null default 'manual';
    alter table products add column if not exists last_synced_at timestamptz;
    alter table products add column if not exists sync_enabled boolean not null default true;
    alter table products add column if not exists unit text not null default 'шт';

    create unique index if not exists ux_products_digit_product_id
      on products(digit_product_id)
      where digit_product_id is not null;

    create table if not exists digit_sync_logs (
      id bigserial primary key,
      source text not null default 'digit',
      full_sync boolean not null default false,
      received_count integer not null default 0,
      created_count integer not null default 0,
      updated_count integer not null default 0,
      deactivated_count integer not null default 0,
      error_count integer not null default 0,
      message text,
      created_at timestamptz not null default now()
    );

    alter table digit_sync_logs add column if not exists reason text;
    alter table digit_sync_logs add column if not exists duration_ms integer;

    create index if not exists idx_products_sync_source on products(sync_source);
    create index if not exists idx_digit_sync_logs_created_at on digit_sync_logs(created_at desc);
  `);
}

function requireDigitApiKey(req, res, next) {
  const expected = String(process.env.DIGIT_SYNC_API_KEY || '').trim();
  const received = String(req.headers['x-digit-api-key'] || '').trim();

  if (!expected) {
    return res.status(503).json({ error: 'DIGIT_SYNC_API_KEY не настроен на сервере' });
  }
  if (!received || received !== expected) {
    return res.status(401).json({ error: 'Неверный ключ синхронизации Digit Учет' });
  }
  next();
}

function normalizeDigitProduct(raw) {
  const digitId = String(raw?.digit_product_id ?? raw?.id ?? '').trim();
  if (!digitId) throw new Error('У товара отсутствует digit_product_id');

  const title = String(raw?.title ?? raw?.name ?? '').trim();
  if (!title) throw new Error(`Товар ${digitId}: отсутствует название`);

  const price = Number(raw?.price ?? raw?.sale_price ?? 0);
  const stock = Number(raw?.stock ?? raw?.quantity ?? 0);

  if (!Number.isFinite(price) || price < 0) throw new Error(`Товар ${digitId}: некорректная цена`);
  if (!Number.isFinite(stock) || stock < 0) throw new Error(`Товар ${digitId}: некорректный остаток`);

  const specs = raw?.specs && typeof raw.specs === 'object' && !Array.isArray(raw.specs)
    ? raw.specs
    : {};

  return {
    digit_product_id: digitId,
    title,
    brand: String(raw?.brand || '').trim() || 'ZONA',
    category: String(raw?.category || '').trim() || 'Без категории',
    price,
    old_price: Number(raw?.old_price || 0),
    stock: Math.floor(stock),
    unit: String(raw?.unit || 'шт').trim() || 'шт',
    spec: String(raw?.spec || raw?.short_spec || '').trim(),
    specs,
    is_active: raw?.is_active === false ? false : true
  };
}

async function ensureOrderSchema() {
  await query(`
    create table if not exists orders (
      id bigserial primary key,
      order_number text not null unique,
      customer_name text not null,
      customer_phone text not null,
      customer_email text,
      delivery_type text not null default 'pickup',
      delivery_address text,
      payment_type text not null default 'cash',
      comment text,
      subtotal numeric(12,2) not null default 0,
      delivery_price numeric(12,2) not null default 0,
      total numeric(12,2) not null default 0,
      status text not null default 'new',
      created_at timestamptz not null default now()
    );
    create table if not exists order_items (
      id bigserial primary key,
      order_id bigint not null references orders(id) on delete cascade,
      product_id bigint references products(id) on delete set null,
      title text not null,
      price numeric(12,2) not null,
      quantity integer not null check (quantity > 0),
      line_total numeric(12,2) not null
    );
    create index if not exists idx_orders_created_at on orders(created_at desc);
    create index if not exists idx_order_items_order_id on order_items(order_id);
  `);
}

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const name = String(body.customer_name || '').trim();
    const phone = String(body.customer_phone || '').trim();
    const deliveryType = body.delivery_type === 'delivery' ? 'delivery' : 'pickup';
    const paymentType = ['cash','transfer'].includes(body.payment_type) ? body.payment_type : 'cash';
    const address = String(body.delivery_address || '').trim();

    if (name.length < 2) return res.status(400).json({ error: 'Укажите имя покупателя' });
    if (phone.replace(/\D/g,'').length < 10) return res.status(400).json({ error: 'Укажите корректный номер телефона' });
    if (!items.length) return res.status(400).json({ error: 'Корзина пуста' });
    if (deliveryType === 'delivery' && address.length < 5) return res.status(400).json({ error: 'Укажите адрес доставки' });

    const ids = [...new Set(items.map(x => Number(x.product_id)).filter(Number.isFinite))];
    const { rows: products } = await client.query(
      `select id,title,price,stock,is_active from products where id = any($1::bigint[])`,
      [ids]
    );
    const byId = new Map(products.map(p => [Number(p.id), p]));

    const normalized = [];
    for (const raw of items) {
      const id = Number(raw.product_id);
      const qty = Math.max(1, Math.min(99, Number(raw.quantity) || 1));
      const p = byId.get(id);
      if (!p || !p.is_active) return res.status(400).json({ error: `Один из товаров больше недоступен` });
      if (Number(p.stock) < qty) return res.status(400).json({ error: `Недостаточно товара «${p.title}». В наличии: ${p.stock}` });
      normalized.push({ id, title:p.title, price:Number(p.price), qty });
    }

    const subtotal = normalized.reduce((sum, x) => sum + x.price * x.qty, 0);
    const deliveryPrice = deliveryType === 'delivery' && subtotal < 15000 ? 500 : 0;
    const total = subtotal + deliveryPrice;
    const orderNumber = `Z${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

    await client.query('begin');
    const { rows } = await client.query(`
      insert into orders
      (order_number,customer_name,customer_phone,customer_email,delivery_type,delivery_address,payment_type,comment,subtotal,delivery_price,total)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      returning id,order_number,total,status,created_at
    `, [
      orderNumber, name, phone, String(body.customer_email || '').trim() || null,
      deliveryType, deliveryType === 'delivery' ? address : null,
      paymentType, String(body.comment || '').trim() || null,
      subtotal, deliveryPrice, total
    ]);
    const order = rows[0];

    for (const item of normalized) {
      await client.query(`
        insert into order_items(order_id,product_id,title,price,quantity,line_total)
        values ($1,$2,$3,$4,$5,$6)
      `,[order.id,item.id,item.title,item.price,item.qty,item.price*item.qty]);
      await client.query(`update products set stock=stock-$1, updated_at=now() where id=$2`,[item.qty,item.id]);
    }
    await client.query('commit');
    res.status(201).json({ ok:true, order });
  } catch (e) {
    await client.query('rollback').catch(()=>{});
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});



app.get('/api/digit/status', requireDigitApiKey, async (_, res) => {
  try {
    const [{ rows: counts }, { rows: logs }] = await Promise.all([
      query(`
        select
          count(*) filter (where sync_source='digit')::int as digit_products,
          count(*) filter (where sync_source='digit' and is_active=true)::int as active_products,
          count(*) filter (where sync_source='digit' and stock>0)::int as in_stock_products,
          max(last_synced_at) as last_synced_at
        from products
      `),
      query(`select * from digit_sync_logs order by created_at desc limit 1`)
    ]);

    res.json({
      ok: true,
      store: 'zona',
      ...counts[0],
      last_sync: logs[0] || null,
      server_time: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/digit/sync', requireDigitApiKey, async (req, res) => {
  const startedAt = Date.now();
  const client = await pool.connect();
  const body = req.body || {};
  const rawProducts = Array.isArray(body.products) ? body.products : [];
  const fullSync = body.full_sync === true;
  const reason = String(body.reason || (fullSync ? 'full' : 'partial')).slice(0, 80);

  if (!rawProducts.length && !fullSync) {
    client.release();
    return res.status(400).json({ error: 'Массив products пуст' });
  }

  let created = 0, updated = 0, deactivated = 0, errors = 0;
  const itemErrors = [];
  const seenIds = [];

  try {
    await client.query('begin');

    for (const raw of rawProducts) {
      try {
        const p = normalizeDigitProduct(raw);
        seenIds.push(p.digit_product_id);

        const existing = await client.query(
          `select id, sync_enabled from products where digit_product_id=$1 limit 1`,
          [p.digit_product_id]
        );

        if (existing.rows.length) {
          if (existing.rows[0].sync_enabled === false) continue;

          await client.query(`
            update products set
              title=$1,
              brand=$2,
              category=$3,
              price=$4,
              old_price=$5,
              stock=$6,
              unit=$7,
              spec=$8,
              specs=$9::jsonb,
              is_active=$10,
              sync_source='digit',
              last_synced_at=now(),
              updated_at=now()
            where digit_product_id=$11
          `, [
            p.title, p.brand, p.category, p.price, p.old_price, p.stock,
            p.unit, p.spec, JSON.stringify(p.specs || {}), p.is_active, p.digit_product_id
          ]);
          updated++;
        } else {
          const slug = `digit-${p.digit_product_id}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

          await client.query(`
            insert into products
            (title,slug,category,brand,spec,price,old_price,badge,stock,description,image_url,rating,reviews,is_active,is_featured,specs,images,digit_product_id,sync_source,last_synced_at,sync_enabled,unit)
            values ($1,$2,$3,$4,$5,$6,$7,'',$8,'','',5,0,$9,false,$10::jsonb,'[]'::jsonb,$11,'digit',now(),true,$12)
          `, [
            p.title, slug, p.category, p.brand, p.spec, p.price, p.old_price,
            p.stock, p.is_active, JSON.stringify(p.specs || {}), p.digit_product_id, p.unit
          ]);
          created++;
        }
      } catch (itemError) {
        errors++;
        itemErrors.push({
          digit_product_id: String(raw?.digit_product_id ?? raw?.id ?? ''),
          error: itemError.message
        });
      }
    }

    // A true full sync is the only operation allowed to deactivate missing DIGIT products.
    if (fullSync) {
      if (seenIds.length) {
        const result = await client.query(`
          update products
          set is_active=false, stock=0, last_synced_at=now(), updated_at=now()
          where sync_source='digit'
            and sync_enabled=true
            and digit_product_id is not null
            and not (digit_product_id = any($1::text[]))
          returning id
        `, [seenIds]);
        deactivated = result.rowCount || 0;
      } else {
        const result = await client.query(`
          update products
          set is_active=false, stock=0, last_synced_at=now(), updated_at=now()
          where sync_source='digit'
            and sync_enabled=true
            and digit_product_id is not null
          returning id
        `);
        deactivated = result.rowCount || 0;
      }
    }

    const durationMs = Date.now() - startedAt;
    await client.query(`
      insert into digit_sync_logs
      (source,full_sync,received_count,created_count,updated_count,deactivated_count,error_count,message,reason,duration_ms)
      values ('digit',$1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      fullSync, rawProducts.length, created, updated, deactivated, errors,
      errors ? 'Синхронизация завершена с ошибками отдельных товаров' : 'OK',
      reason,
      durationMs
    ]);

    await client.query('commit');

    res.json({
      ok: true,
      full_sync: fullSync,
      reason,
      received: rawProducts.length,
      created,
      updated,
      deactivated,
      errors,
      item_errors: itemErrors,
      duration_ms: durationMs,
      synced_at: new Date().toISOString()
    });
  } catch (e) {
    await client.query('rollback').catch(()=>{});
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Lightweight endpoint used by DIGIT for instant stock/price changes.
// It intentionally never touches website-only fields such as images/description.
app.post('/api/digit/stock', requireDigitApiKey, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'Массив items пуст' });

  const client = await pool.connect();
  let updated = 0;
  const errors = [];
  try {
    await client.query('begin');
    for (const raw of items) {
      const id = String(raw?.digit_product_id ?? raw?.id ?? '').trim();
      const stock = Number(raw?.stock ?? raw?.quantity);
      const price = raw?.price === undefined ? null : Number(raw.price);
      if (!id || !Number.isFinite(stock) || stock < 0 || (price !== null && (!Number.isFinite(price) || price < 0))) {
        errors.push({ digit_product_id:id, error:'Некорректные данные' });
        continue;
      }

      const result = await client.query(`
        update products
        set
          stock=$1,
          price=coalesce($2,price),
          is_active=case when sync_enabled=false then is_active else true end,
          last_synced_at=now(),
          updated_at=now()
        where digit_product_id=$3 and sync_source='digit' and sync_enabled=true
      `,[Math.floor(stock),price,id]);

      updated += result.rowCount || 0;
    }
    await client.query('commit');
    res.json({ ok:true, received:items.length, updated, errors:errors.length, item_errors:errors });
  } catch (e) {
    await client.query('rollback').catch(()=>{});
    res.status(500).json({ error:e.message });
  } finally {
    client.release();
  }
});

app.get('/api/digit/logs', requireDigitApiKey, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const { rows } = await query(
      `select * from digit_sync_logs order by created_at desc limit $1`,
      [limit]
    );
    res.json({ ok:true, logs:rows });
  } catch (e) {
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/health', async (_, res) => {
  try {
    await query('select 1');
    res.json({ ok: true, database: true });
  } catch (e) {
    res.status(500).json({ ok: false, database: false, error: e.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const admin = req.query.admin === '1';
    const sql = admin
      ? `select * from products order by created_at desc`
      : `select * from products where is_active = true order by is_featured desc, created_at desc`;
    const { rows } = await query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/categories', async (_, res) => {
  try {
    const { rows } = await query(`select * from categories order by sort_order, name`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await query(`select id, email, password_hash from admins where lower(email)=lower($1) limit 1`, [email]);

    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = createToken({ id: admin.id, email: admin.email });
    res.json({ token, email: admin.email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });

    if (s3Enabled()) {
      const result = await putImage({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname
      });
      return res.json({ url: result.url, storage: 's3' });
    }

    const base = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
    res.json({ url: `${base}/uploads/${req.file.filename}`, storage: 'local' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const p = req.body;
    const { rows } = await query(`
      insert into products
      (title, slug, category, brand, spec, price, old_price, badge, stock, description, image_url, rating, reviews, is_active, is_featured, specs, images)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
      returning *
    `, [
      p.title, p.slug, p.category, p.brand || 'ZONA', p.spec || '',
      Number(p.price || 0), Number(p.old_price || 0), p.badge || '',
      Number(p.stock || 0), p.description || '', p.image_url || '',
      Number(p.rating || 5), Number(p.reviews || 0),
      Boolean(p.is_active), Boolean(p.is_featured),
      JSON.stringify(p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {}),
      JSON.stringify(Array.isArray(p.images) ? p.images.filter(Boolean) : [])
    ]);
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = req.body;
    const { rows } = await query(`
      update products set
        title=$1, slug=$2, category=$3, brand=$4, spec=$5,
        price=$6, old_price=$7, badge=$8, stock=$9, description=$10,
        image_url=$11, rating=$12, reviews=$13, is_active=$14,
        is_featured=$15, specs=$16::jsonb, images=$17::jsonb,
        sync_enabled=coalesce($18,sync_enabled), updated_at=now()
      where id=$19
      returning *
    `, [
      p.title, p.slug, p.category, p.brand || 'ZONA', p.spec || '',
      Number(p.price || 0), Number(p.old_price || 0), p.badge || '',
      Number(p.stock || 0), p.description || '', p.image_url || '',
      Number(p.rating || 5), Number(p.reviews || 0),
      Boolean(p.is_active), Boolean(p.is_featured),
      JSON.stringify(p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {}),
      JSON.stringify(Array.isArray(p.images) ? p.images.filter(Boolean) : []),
      typeof p.sync_enabled === 'boolean' ? p.sync_enabled : null,
      id
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(`delete from products where id=$1 returning image_url, images`, [id]);

    if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });

    const urls = [...new Set([
      rows[0].image_url || '',
      ...(Array.isArray(rows[0].images) ? rows[0].images : [])
    ].filter(Boolean))];

    for (const imageUrl of urls) {
      try {
        if (s3Enabled()) {
          await deleteImageByUrl(imageUrl);
        } else if (imageUrl.includes('/uploads/')) {
          const name = imageUrl.split('/uploads/').pop();
          const filePath = path.join(uploadsDir, name);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.warn('Image cleanup failed:', cleanupError?.message || cleanupError);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(__dirname, '../dist');
  app.use(express.static(distDir, {
    maxAge: '1h',
    etag: true
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Ошибка сервера' });
});

ensureBaseSchema()
  .then(() => Promise.all([
    ensureOrderSchema(),
    ensureProductSpecsSchema(),
    ensureProductImagesSchema(),
    ensureDigitSyncSchema()
  ]))
  .then(() => ensureInitialAdmin())
  .then(() => app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZONA production server listening on port ${PORT}`);
    console.log(`Storage: ${s3Enabled() ? 'S3' : 'local filesystem'}`);
  }))
  .catch(err => {
    console.error('Не удалось подготовить таблицы заказов:', err);
    process.exit(1);
  });