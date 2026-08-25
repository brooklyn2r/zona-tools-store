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


async function ensureCategorySchema() {
  await query(`
    alter table categories add column if not exists image_url text;
    alter table categories add column if not exists sync_source text not null default 'digit';
    alter table categories add column if not exists is_active boolean not null default true;
    alter table categories add column if not exists updated_at timestamptz not null default now();
    create index if not exists idx_categories_active_sort on categories(is_active, sort_order, name);
  `);
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


function normalizeJsonObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeJsonArray(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      // A single URL string is accepted as one image.
      return /^https?:\/\//i.test(value.trim()) ? [value.trim()] : [];
    }
  }
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function productAdminJsonPayload(p) {
  const specsObj = normalizeJsonObject(p?.specs);
  const imagesArr = normalizeJsonArray(p?.images);

  const specsJson = JSON.stringify(specsObj);
  const imagesJson = JSON.stringify(imagesArr);

  // Fail here with a clear message rather than letting PostgreSQL emit a vague error.
  try { JSON.parse(specsJson); } catch { throw new Error('Поле specs содержит некорректный JSON'); }
  try { JSON.parse(imagesJson); } catch { throw new Error('Поле images содержит некорректный JSON'); }

  return { specsJson, imagesJson };
}


function categorySlug(name) {
  const source = String(name || '').trim().toLowerCase();
  const translit = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return source
    .split('')
    .map(ch => translit[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `category-${Date.now()}`;
}

async function ensureDigitCategory(client, categoryName) {
  const name = String(categoryName || '').trim() || 'Без категории';
  const existing = await client.query(
    `select id from categories where lower(name)=lower($1) limit 1`,
    [name]
  );
  if (existing.rows.length) {
    await client.query(
      `update categories set is_active=true,sync_source='digit',updated_at=now() where id=$1`,
      [existing.rows[0].id]
    );
    return existing.rows[0];
  }

  const maxResult = await client.query(
    `select coalesce(max(sort_order),0)::int as max_sort from categories`
  );
  const nextSort = Number(maxResult.rows[0]?.max_sort || 0) + 10;
  const baseSlug = categorySlug(name);

  // Avoid collisions when different names transliterate to the same slug.
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const collision = await client.query(
      `select id,name from categories where slug=$1 limit 1`,
      [slug]
    );
    if (!collision.rows.length) break;
    if (String(collision.rows[0].name).toLowerCase() === name.toLowerCase()) {
      return collision.rows[0];
    }
    slug = `${baseSlug}-${suffix++}`;
  }

  const { rows } = await client.query(
    `insert into categories(name,slug,sort_order,sync_source,is_active)
     values($1,$2,$3,'digit',true)
     on conflict(name) do update
       set is_active=true,sync_source='digit',updated_at=now()
     returning id,name,slug,sort_order`,
    [name, slug, nextSort]
  );
  return rows[0];
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

const DELIVERY_METHODS = {
  pickup: 'Самовывоз из магазина',
  cdek: 'СДЭК',
  russian_post: 'Почта России',
  local_courier: 'Доставка по Хасавюрту',
  transport_company: 'Транспортная компания / другой способ'
};
const ORDER_STATUSES = new Set(['new','confirmed','assembling','shipped','completed','cancelled']);

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
    const email = String(body.customer_email || '').trim();
    const deliveryType = String(body.delivery_type || 'pickup');
    const paymentType = ['cash','transfer'].includes(body.payment_type) ? body.payment_type : 'cash';
    const address = String(body.delivery_address || '').trim();
    const comment = String(body.comment || '').trim();

    if (name.length < 2) return res.status(400).json({ error: 'Укажите имя покупателя' });
    if (phone.replace(/\D/g,'').length < 10) return res.status(400).json({ error: 'Укажите корректный номер телефона' });
    if (!items.length) return res.status(400).json({ error: 'Корзина пуста' });
    if (!DELIVERY_METHODS[deliveryType]) return res.status(400).json({ error: 'Выберите способ получения' });
    if (deliveryType !== 'pickup' && address.length < 3) return res.status(400).json({ error: 'Укажите адрес, пункт выдачи или данные доставки' });

    const ids = [...new Set(items.map(x => Number(x.product_id)).filter(Number.isFinite))];
    const { rows: products } = await client.query(
      `select id,title,price,stock,is_active from products where id = any($1::bigint[])`, [ids]
    );
    const byId = new Map(products.map(p => [Number(p.id), p]));
    const normalized = [];
    for (const raw of items) {
      const id = Number(raw.product_id);
      const qty = Math.max(1, Math.min(99, Number(raw.quantity) || 1));
      const p = byId.get(id);
      if (!p || !p.is_active) return res.status(400).json({ error: 'Один из товаров больше недоступен' });
      if (Number(p.stock) <= 0) return res.status(400).json({ error: `Товара «${p.title}» нет в наличии` });
      if (Number(p.stock) < qty) return res.status(400).json({ error: `Недостаточно товара «${p.title}». В наличии: ${p.stock}` });
      normalized.push({ id, title:p.title, price:Number(p.price), qty });
    }

    const subtotal = normalized.reduce((sum,x)=>sum+x.price*x.qty,0);
    const deliveryPrice = 0;
    const total = subtotal;
    const orderNumber = `Z-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

    await client.query('begin');
    const { rows } = await client.query(`
      insert into orders
      (order_number,customer_name,customer_phone,customer_email,delivery_type,delivery_address,payment_type,comment,subtotal,delivery_price,total,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new')
      returning id,order_number,total,subtotal,delivery_price,status,created_at,delivery_type,delivery_address
    `,[orderNumber,name,phone,email||null,deliveryType,deliveryType==='pickup'?null:address,paymentType,comment||null,subtotal,deliveryPrice,total]);
    const order=rows[0];

    for(const item of normalized){
      await client.query(`insert into order_items(order_id,product_id,title,price,quantity,line_total) values($1,$2,$3,$4,$5,$6)`,
        [order.id,item.id,item.title,item.price,item.qty,item.price*item.qty]);
    }
    // DIGIT УЧЕТ is the inventory master. A website order does not reduce stock.
    await client.query('commit');
    res.status(201).json({
      ok:true,
      order:{...order,delivery_label:DELIVERY_METHODS[deliveryType],customer_name:name,customer_phone:phone,customer_email:email,payment_type:paymentType,comment},
      items:normalized.map(x=>({product_id:x.id,title:x.title,price:x.price,quantity:x.qty,line_total:x.price*x.qty}))
    });
  } catch(e){
    await client.query('rollback').catch(()=>{});
    res.status(500).json({error:e.message});
  } finally { client.release(); }
});

app.get('/api/admin/orders', requireAdmin, async (_, res) => {
  try {
    const { rows: orders } = await query(`select * from orders order by created_at desc limit 300`);
    if (!orders.length) return res.json([]);
    const ids=orders.map(o=>o.id);
    const { rows: items }=await query(`select * from order_items where order_id = any($1::bigint[]) order by id`,[ids]);
    const grouped=new Map();
    for(const item of items){const id=Number(item.order_id);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(item);}
    res.json(orders.map(o=>({...o,delivery_label:DELIVERY_METHODS[o.delivery_type]||o.delivery_type,items:grouped.get(Number(o.id))||[]})));
  } catch(e){res.status(500).json({error:e.message});}
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req,res)=>{
  try{
    const id=Number(req.params.id), status=String(req.body?.status||'').trim();
    if(!Number.isFinite(id)) return res.status(400).json({error:'Некорректный ID заказа'});
    if(!ORDER_STATUSES.has(status)) return res.status(400).json({error:'Некорректный статус заказа'});
    const {rows}=await query(`update orders set status=$1 where id=$2 returning *`,[status,id]);
    if(!rows.length) return res.status(404).json({error:'Заказ не найден'});
    res.json(rows[0]);
  }catch(e){res.status(500).json({error:e.message});}
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

        // DIGIT УЧЁТ is the source of truth for catalog category names.
        // Any category that exists in DIGIT is created on the website automatically.
        await ensureDigitCategory(client, p.category);

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
      const receivedCategories=[...new Set(rawProducts.map(raw=>String(raw?.category||'').trim()).filter(Boolean))];
      if(receivedCategories.length){
        await client.query(`
          update categories
          set is_active=false,updated_at=now()
          where sync_source='digit' and not (name = any($1::text[]))
        `,[receivedCategories]);
        for(const categoryName of receivedCategories){
          await ensureDigitCategory(client,categoryName);
        }
      }

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
    res.json({ ok: true, database: true, build: 's3-json-hard-fix-2026-08-24' });
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
    const { rows } = await query(`
      select id,name,slug,sort_order,image_url,sync_source,is_active,updated_at
      from categories
      where is_active=true
      order by sort_order, name
    `);
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

app.get('/api/admin/categories', requireAdmin, async (_, res) => {
  try {
    const { rows } = await query(`
      select id,name,slug,sort_order,image_url,sync_source,is_active,updated_at
      from categories
      order by is_active desc, sort_order, name
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const id=Number(req.params.id);
    if(!Number.isFinite(id)) return res.status(400).json({error:'Некорректный ID категории'});
    const imageUrl=String(req.body?.image_url||'').trim();
    const sortOrder=Number(req.body?.sort_order??0);
    const isActive=req.body?.is_active!==false;
    const { rows }=await query(`
      update categories
      set image_url=$1,sort_order=$2,is_active=$3,updated_at=now()
      where id=$4
      returning id,name,slug,sort_order,image_url,sync_source,is_active,updated_at
    `,[imageUrl||null,Number.isFinite(sortOrder)?sortOrder:0,isActive,id]);
    if(!rows.length) return res.status(404).json({error:'Категория не найдена'});
    res.json(rows[0]);
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const p = req.body || {};
    const { specsJson, imagesJson } = productAdminJsonPayload(p);
    await ensureDigitCategory({ query: (...args) => query(...args) }, p.category);

    const { rows } = await query(`
      insert into products
      (title, slug, category, brand, spec, price, old_price, badge, stock, description, image_url, rating, reviews, is_active, is_featured, specs, images)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CAST($16 AS jsonb),CAST($17 AS jsonb))
      returning *
    `, [
      String(p.title || '').trim(),
      String(p.slug || '').trim(),
      String(p.category || '').trim(),
      String(p.brand || 'ZONA').trim(),
      String(p.spec || ''),
      Number(p.price || 0),
      Number(p.old_price || 0),
      String(p.badge || ''),
      Number(p.stock || 0),
      String(p.description || ''),
      String(p.image_url || ''),
      Number(p.rating || 5),
      Number(p.reviews || 0),
      Boolean(p.is_active),
      Boolean(p.is_featured),
      specsJson,
      imagesJson
    ]);

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[ADMIN PRODUCT CREATE]', {
      message: e?.message,
      detail: e?.detail,
      where: e?.where,
      code: e?.code,
      specsType: typeof req.body?.specs,
      imagesType: typeof req.body?.images,
      imagesIsArray: Array.isArray(req.body?.images)
    });
    res.status(400).json({
      error: e?.message || 'Не удалось создать товар',
      code: e?.code || null,
      detail: e?.detail || null,
      build: 's3-json-hard-fix-2026-08-24'
    });
  }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный ID товара' });

    const p = req.body || {};
    const { specsJson, imagesJson } = productAdminJsonPayload(p);
    await ensureDigitCategory({ query: (...args) => query(...args) }, p.category);

    const { rows } = await query(`
      update products set
        title=$1,
        slug=$2,
        category=$3,
        brand=$4,
        spec=$5,
        price=$6,
        old_price=$7,
        badge=$8,
        stock=$9,
        description=$10,
        image_url=$11,
        rating=$12,
        reviews=$13,
        is_active=$14,
        is_featured=$15,
        specs=CAST($16 AS jsonb),
        images=CAST($17 AS jsonb),
        sync_enabled=coalesce($18,sync_enabled),
        updated_at=now()
      where id=$19
      returning *
    `, [
      String(p.title || '').trim(),
      String(p.slug || '').trim(),
      String(p.category || '').trim(),
      String(p.brand || 'ZONA').trim(),
      String(p.spec || ''),
      Number(p.price || 0),
      Number(p.old_price || 0),
      String(p.badge || ''),
      Number(p.stock || 0),
      String(p.description || ''),
      String(p.image_url || ''),
      Number(p.rating || 5),
      Number(p.reviews || 0),
      Boolean(p.is_active),
      Boolean(p.is_featured),
      specsJson,
      imagesJson,
      typeof p.sync_enabled === 'boolean' ? p.sync_enabled : null,
      id
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[ADMIN PRODUCT UPDATE]', {
      message: e?.message,
      detail: e?.detail,
      where: e?.where,
      code: e?.code,
      productId: req.params.id,
      specsType: typeof req.body?.specs,
      imagesType: typeof req.body?.images,
      imagesIsArray: Array.isArray(req.body?.images),
      imageCount: Array.isArray(req.body?.images) ? req.body.images.length : null
    });

    res.status(400).json({
      error: e?.message || 'Не удалось сохранить товар',
      code: e?.code || null,
      detail: e?.detail || null,
      build: 's3-json-hard-fix-2026-08-24'
    });
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
    ensureCategorySchema(),
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