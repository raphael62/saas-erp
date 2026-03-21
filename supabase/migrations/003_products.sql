-- Products table (multi-tenant via organization_id)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  description text,
  category text,
  unit text default 'pcs',
  cost_price numeric(12, 2) default 0,
  sale_price numeric(12, 2) default 0,
  stock_quantity numeric(12, 2) default 0,
  min_stock numeric(12, 2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, sku)
);

create index if not exists idx_products_organization on public.products(organization_id);
create index if not exists idx_products_sku on public.products(organization_id, sku);

alter table public.products enable row level security;

-- Users can only see products for their own organization
create policy "Users can read own org products"
  on public.products for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

create policy "Users can insert own org products"
  on public.products for insert
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

create policy "Users can update own org products"
  on public.products for update
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

create policy "Users can delete own org products"
  on public.products for delete
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );
