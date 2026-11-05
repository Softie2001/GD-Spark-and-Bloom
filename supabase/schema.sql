-- GD Spark & Bloom — dedicated Supabase project only.
-- Apply ONLY to a new, empty GD Spark & Bloom project after confirmation.
-- Do NOT apply to Vendstal production or staging.
-- All exposed tables have RLS enabled with no direct client policies;
-- only Vercel server functions using service-role credentials may access them.

create extension if not exists pgcrypto;

create table if not exists public.gdsb_admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.gdsb_categories (
  name text primary key check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.gdsb_products (
  id text primary key check (length(id) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 150),
  category text not null references public.gdsb_categories(name) on update cascade,
  description text not null default '',
  price integer not null check (price >= 0),
  sale_price integer check (sale_price is null or (sale_price >= 0 and sale_price < price)),
  in_stock boolean not null default true,
  best_seller boolean not null default false,
  hidden boolean not null default false,
  is_kit boolean not null default false,
  image_url text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists gdsb_products_visible on public.gdsb_products(hidden, category);

create table if not exists public.gdsb_coupons (
  code text primary key check (length(trim(code)) between 3 and 32),
  discount_type text not null check (discount_type in ('percent','fixed')),
  value integer not null check (value > 0),
  scope text not null check (scope in ('all','product')),
  product_id text references public.gdsb_products(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gdsb_coupon_percent check (discount_type != 'percent' or value <= 100),
  constraint gdsb_coupon_scope check (scope = 'all' or product_id is not null)
);

create table if not exists public.gdsb_settings (
  id smallint primary key default 1 check (id = 1),
  coupon_entry_enabled boolean not null default false,
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  hero_title text not null default 'Your wellness, the herbal way.',
  hero_subtitle text not null default '',
  hero_image text not null default 'assets/hero-full.jpg',
  promo_title text not null default '',
  promo_subtitle text not null default '',
  promo_image text not null default '',
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  promo_enabled boolean not null default false,
  promo_countdown boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.gdsb_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.gdsb_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (length(reference) between 8 and 55),
  customer_name text not null,
  whatsapp text not null,
  delivery_state text not null,
  city text not null,
  delivery_address text not null,
  note text not null default '',
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  coupon_code text,
  receipt_path text not null,
  status text not null default 'Pending verification' check (status in (
    'Pending verification','Payment confirmed','Payment not confirmed',
    'Preparing order','Out for delivery','Delivered','Cancelled'
  )),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notification_sent_at timestamptz,
  notification_error text
);
create index if not exists gdsb_orders_submitted_at on public.gdsb_orders(submitted_at desc);

create table if not exists public.gdsb_order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.gdsb_orders(id) on delete cascade,
  product_id text references public.gdsb_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 100),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total >= 0)
);
create index if not exists gdsb_items_order on public.gdsb_order_items(order_id);

create table if not exists public.gdsb_reviews (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  location text not null default '',
  message text not null,
  stars integer not null default 5 check (stars between 1 and 5),
  consent boolean not null default false,
  visible boolean not null default false,
  created_at timestamptz not null default now()
);

-- Storage: receipts are PRIVATE, uploaded only through Vercel.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gdsb-receipts','gdsb-receipts',false,1048576,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=1048576,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Product and banner images are uploaded to Cloudinary by authenticated Vercel admin functions.
-- Do not create a public Supabase image bucket for them.

-- No direct browser role can query, change, or list private application data.
alter table public.gdsb_admin_members enable row level security;
alter table public.gdsb_categories enable row level security;
alter table public.gdsb_products enable row level security;
alter table public.gdsb_coupons enable row level security;
alter table public.gdsb_settings enable row level security;
alter table public.gdsb_orders enable row level security;
alter table public.gdsb_order_items enable row level security;
alter table public.gdsb_reviews enable row level security;

revoke all on table public.gdsb_admin_members,public.gdsb_categories,
 public.gdsb_products,public.gdsb_coupons,public.gdsb_settings,
 public.gdsb_orders,public.gdsb_order_items,public.gdsb_reviews
 from anon,authenticated;

grant select,insert,update,delete on table
 public.gdsb_admin_members, public.gdsb_categories,
 public.gdsb_products, public.gdsb_coupons, public.gdsb_settings,
 public.gdsb_orders, public.gdsb_order_items, public.gdsb_reviews
 to service_role;
grant usage,select on sequence public.gdsb_order_items_id_seq to service_role;

-- Bootstrap the admin ONLY after an admin user has been created in Supabase Auth.
-- Replace the placeholder with its actual UUID, then run exactly once:
-- INSERT INTO public.gdsb_admin_members(user_id) VALUES ('ADMIN_AUTH_USER_UUID');
