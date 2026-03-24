-- Sales Orders (pre-invoice orders, no stock impact)
-- Drop dependents first (legacy names / wrong schema). CASCADE removes any stray FKs.
drop table if exists public.sales_order_items cascade;
drop table if exists public.sales_order_lines cascade;
drop table if exists public.sales_orders cascade;

do $$
declare
  customer_id_type text;
  sales_rep_id_type text;
  location_id_type text;
  product_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into customer_id_type
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'customers' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into sales_rep_id_type
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'sales_reps' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into location_id_type
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'locations' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into product_id_type
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'products' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  if customer_id_type is null then raise exception 'customers.id not found'; end if;
  if sales_rep_id_type is null then raise exception 'sales_reps.id not found'; end if;
  if location_id_type is null then raise exception 'locations.id not found'; end if;
  if product_id_type is null then raise exception 'products.id not found'; end if;

  execute format(
    'create table if not exists public.sales_orders (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      order_no text not null,
      customer_id %s references public.customers(id) on delete set null,
      sales_rep_id %s references public.sales_reps(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      order_date date not null,
      delivery_date date,
      notes text,
      total_qty numeric(14, 2) not null default 0,
      sub_total numeric(14, 2) not null default 0,
      tax_total numeric(14, 2) not null default 0,
      grand_total numeric(14, 2) not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, order_no)
    )',
    customer_id_type, sales_rep_id_type, location_id_type
  );

  execute format(
    'create table if not exists public.sales_order_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      item_name_snapshot text,
      price_type text,
      pack_unit numeric(14, 2) not null default 0,
      qty numeric(14, 2) not null default 0,
      cl_qty numeric(14, 2) not null default 0,
      price_ex numeric(14, 6) not null default 0,
      price_tax_inc numeric(14, 2) not null default 0,
      tax_rate numeric(7, 3) not null default 0,
      tax_amount numeric(14, 2) not null default 0,
      value_tax_inc numeric(14, 2) not null default 0,
      vat_type text not null default ''inc'',
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_sales_orders_org on public.sales_orders(organization_id);
create index if not exists idx_sales_orders_order_date on public.sales_orders(order_date);
create index if not exists idx_sales_order_lines_org on public.sales_order_lines(organization_id);
create index if not exists idx_sales_order_lines_order on public.sales_order_lines(sales_order_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

drop policy if exists "Users can read own org sales_orders" on public.sales_orders;
create policy "Users can read own org sales_orders" on public.sales_orders for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_orders" on public.sales_orders;
create policy "Users can insert own org sales_orders" on public.sales_orders for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_orders" on public.sales_orders;
create policy "Users can update own org sales_orders" on public.sales_orders for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_orders" on public.sales_orders;
create policy "Users can delete own org sales_orders" on public.sales_orders for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org sales_order_lines" on public.sales_order_lines;
create policy "Users can read own org sales_order_lines" on public.sales_order_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_order_lines" on public.sales_order_lines;
create policy "Users can insert own org sales_order_lines" on public.sales_order_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_order_lines" on public.sales_order_lines;
create policy "Users can update own org sales_order_lines" on public.sales_order_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_order_lines" on public.sales_order_lines;
create policy "Users can delete own org sales_order_lines" on public.sales_order_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_sales_order_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_sales_orders_updated_at on public.sales_orders;
create trigger trg_sales_orders_updated_at before update on public.sales_orders
  for each row execute function public.set_sales_order_updated_at();
drop trigger if exists trg_sales_order_lines_updated_at on public.sales_order_lines;
create trigger trg_sales_order_lines_updated_at before update on public.sales_order_lines
  for each row execute function public.set_sales_order_updated_at();
