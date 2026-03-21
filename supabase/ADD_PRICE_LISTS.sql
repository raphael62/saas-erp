-- Run this in Supabase SQL Editor
-- Adds sales price list document tables:
-- - price_lists (header)
-- - price_list_items (line items)
-- NOTE:
--   This script auto-detects the data type of public.products.id
--   (uuid/int/bigint) and creates price_list_items.product_id with
--   a matching type to avoid FK type mismatch errors.

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  price_type_id uuid not null references public.price_types(id) on delete restrict,
  effective_date date not null,
  expiry_date date,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
declare
  product_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into product_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.price_list_items (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      price_list_id uuid not null references public.price_lists(id) on delete cascade,
      product_id %s not null references public.products(id) on delete cascade,
      price numeric(12, 2) not null default 0,
      tax_rate numeric(5, 2) not null default 20,
      vat_type text not null default ''inc'',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, price_list_id, product_id)
    )',
    product_id_type
  );
end $$;

create index if not exists idx_price_lists_org on public.price_lists(organization_id);
create index if not exists idx_price_list_items_org on public.price_list_items(organization_id);
create index if not exists idx_price_list_items_price_list on public.price_list_items(price_list_id);

alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;

drop policy if exists "Users can read own org price_lists" on public.price_lists;
create policy "Users can read own org price_lists" on public.price_lists for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org price_lists" on public.price_lists;
create policy "Users can insert own org price_lists" on public.price_lists for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org price_lists" on public.price_lists;
create policy "Users can update own org price_lists" on public.price_lists for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org price_lists" on public.price_lists;
create policy "Users can delete own org price_lists" on public.price_lists for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org price_list_items" on public.price_list_items;
create policy "Users can read own org price_list_items" on public.price_list_items for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org price_list_items" on public.price_list_items;
create policy "Users can insert own org price_list_items" on public.price_list_items for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org price_list_items" on public.price_list_items;
create policy "Users can update own org price_list_items" on public.price_list_items for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org price_list_items" on public.price_list_items;
create policy "Users can delete own org price_list_items" on public.price_list_items for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
