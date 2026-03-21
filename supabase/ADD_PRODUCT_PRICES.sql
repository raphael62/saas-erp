-- Run this in Supabase SQL Editor
-- Adds product_prices table for Sales > Price List

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_type_id uuid not null references public.price_types(id) on delete cascade,
  price numeric(12, 2) not null default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, product_id, price_type_id)
);

create index if not exists idx_product_prices_organization on public.product_prices(organization_id);
create index if not exists idx_product_prices_product on public.product_prices(product_id);
create index if not exists idx_product_prices_type on public.product_prices(price_type_id);

alter table public.product_prices enable row level security;

drop policy if exists "Users can read own org product_prices" on public.product_prices;
create policy "Users can read own org product_prices" on public.product_prices for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org product_prices" on public.product_prices;
create policy "Users can insert own org product_prices" on public.product_prices for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org product_prices" on public.product_prices;
create policy "Users can update own org product_prices" on public.product_prices for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org product_prices" on public.product_prices;
create policy "Users can delete own org product_prices" on public.product_prices for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
