create table if not exists categories (
  id bigserial primary key,
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  category text not null,
  brand text not null default 'ZONA',
  spec text,
  price numeric(12,2) not null default 0,
  old_price numeric(12,2) not null default 0,
  badge text,
  stock integer not null default 0,
  description text,
  image_url text,
  rating numeric(2,1) not null default 5.0,
  reviews integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  specs jsonb not null default '{}'::jsonb,
  images jsonb not null default '[]'::jsonb,
  digit_product_id text unique,
  sync_source text not null default 'manual',
  last_synced_at timestamptz,
  sync_enabled boolean not null default true,
  unit text not null default 'шт',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admins (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

insert into categories(name,slug,sort_order) values
('Шуруповёрты','screwdrivers',10),
('Перфораторы','rotary-hammers',20),
('Болгарки','grinders',30),
('Дрели','drills',40),
('Лобзики','jigsaws',50),
('Компрессоры','compressors',60),
('Сварка','welding',70),
('Измерение','measurement',80)
on conflict (name) do nothing;

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

create index if not exists idx_products_digit_product_id on products(digit_product_id);
create index if not exists idx_products_sync_source on products(sync_source);
create index if not exists idx_digit_sync_logs_created_at on digit_sync_logs(created_at desc);
