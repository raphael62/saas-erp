-- End-of-day closing qty per product for fast opening stock on change history.
-- opening(start of day D) = closing at end of day D-1 from this table (or computed once then cached here).
-- product_id matches public.products.id (uuid in new installs; integer on some legacy databases).

alter table public.organizations
  add column if not exists inventory_history_anchor_date date;

do $$
declare
  product_id_type text;
  current_product_type text;
  tbl regclass;
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

  tbl := to_regclass('public.inventory_stock_snapshots');
  if tbl is not null then
    select format_type(a.atttypid, a.atttypmod)
      into current_product_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'inventory_stock_snapshots'
      and a.attname = 'product_id'
      and a.attnum > 0
      and not a.attisdropped;

    if current_product_type is not null and current_product_type <> product_id_type then
      execute 'drop table public.inventory_stock_snapshots cascade';
    end if;
  end if;

  execute format(
    'create table if not exists public.inventory_stock_snapshots (
      organization_id uuid not null references public.organizations(id) on delete cascade,
      snapshot_date date not null,
      product_id %s not null references public.products(id) on delete cascade,
      closing_qty numeric(14, 4) not null default 0,
      updated_at timestamptz not null default now(),
      primary key (organization_id, snapshot_date, product_id)
    )',
    product_id_type
  );
end $$;

create index if not exists idx_inventory_stock_snapshots_org_date
  on public.inventory_stock_snapshots(organization_id, snapshot_date desc);

alter table public.inventory_stock_snapshots enable row level security;

drop policy if exists "Users can read own org inventory_stock_snapshots" on public.inventory_stock_snapshots;
create policy "Users can read own org inventory_stock_snapshots" on public.inventory_stock_snapshots
  for select using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org inventory_stock_snapshots" on public.inventory_stock_snapshots;
create policy "Users can insert own org inventory_stock_snapshots" on public.inventory_stock_snapshots
  for insert with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org inventory_stock_snapshots" on public.inventory_stock_snapshots;
create policy "Users can update own org inventory_stock_snapshots" on public.inventory_stock_snapshots
  for update using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org inventory_stock_snapshots" on public.inventory_stock_snapshots;
create policy "Users can delete own org inventory_stock_snapshots" on public.inventory_stock_snapshots
  for delete using (organization_id = public.get_my_org_id());

select pg_notify('pgrst', 'reload schema');
