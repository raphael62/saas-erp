-- Per-location stock balances for multi-location inventory views.
-- Default/first location (by code, then name) receives stock deltas when products.stock_quantity changes.
-- product_id / location_id types match public.products.id and public.locations.id (uuid or integer legacy).

do $$
declare
  product_id_type text;
  location_id_type text;
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

  select format_type(a.atttypid, a.atttypmod)
    into location_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'locations'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;
  if location_id_type is null then
    raise exception 'public.locations.id not found. Ensure locations table exists first.';
  end if;

  execute format(
    $ddl$
    create table if not exists public.inventory_location_balances (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      product_id %s not null references public.products(id) on delete cascade,
      location_id %s not null references public.locations(id) on delete cascade,
      quantity numeric(14, 2) not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, product_id, location_id)
    )
    $ddl$,
    product_id_type,
    location_id_type
  );
end $$;

create index if not exists idx_inv_loc_bal_org on public.inventory_location_balances(organization_id);
create index if not exists idx_inv_loc_bal_product on public.inventory_location_balances(product_id);
create index if not exists idx_inv_loc_bal_location on public.inventory_location_balances(location_id);

alter table public.inventory_location_balances enable row level security;

drop policy if exists "Users read own org inventory_location_balances" on public.inventory_location_balances;
create policy "Users read own org inventory_location_balances"
  on public.inventory_location_balances for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users insert own org inventory_location_balances" on public.inventory_location_balances;
create policy "Users insert own org inventory_location_balances"
  on public.inventory_location_balances for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users update own org inventory_location_balances" on public.inventory_location_balances;
create policy "Users update own org inventory_location_balances"
  on public.inventory_location_balances for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users delete own org inventory_location_balances" on public.inventory_location_balances;
create policy "Users delete own org inventory_location_balances"
  on public.inventory_location_balances for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_inventory_location_balances_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_location_balances_updated_at on public.inventory_location_balances;
create trigger trg_inventory_location_balances_updated_at
before update on public.inventory_location_balances
for each row execute function public.set_inventory_location_balances_updated_at();

-- One-time backfill: assign full global stock to the first active location per org (by code, then name).
insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
select
  p.organization_id,
  p.id,
  loc.id,
  coalesce(p.stock_quantity, 0)
from public.products p
inner join lateral (
  select l.id
  from public.locations l
  where l.organization_id = p.organization_id
    and coalesce(l.is_active, true)
  order by l.code nulls last, l.name
  limit 1
) loc on true
on conflict (organization_id, product_id, location_id) do nothing;

-- Keep first location balance in sync when global stock changes (delta applied there).
create or replace function public.sync_inventory_location_balance_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc_id public.locations.id%type;
  delta numeric(14, 2);
begin
  select l.id into loc_id
  from public.locations l
  where l.organization_id = new.organization_id
    and coalesce(l.is_active, true)
  order by l.code nulls last, l.name
  limit 1;

  if loc_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
    values (new.organization_id, new.id, loc_id, coalesce(new.stock_quantity, 0))
    on conflict (organization_id, product_id, location_id)
    do update set
      quantity = excluded.quantity,
      updated_at = now();
    return new;
  end if;

  if tg_op = 'UPDATE' and (new.stock_quantity is not distinct from old.stock_quantity) then
    return new;
  end if;

  delta := coalesce(new.stock_quantity, 0) - coalesce(old.stock_quantity, 0);
  if delta = 0 then
    return new;
  end if;

  insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
  values (new.organization_id, new.id, loc_id, delta)
  on conflict (organization_id, product_id, location_id)
  do update set
    quantity = public.inventory_location_balances.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_products_sync_inventory_location_balance on public.products;
create trigger trg_products_sync_inventory_location_balance
after insert or update of stock_quantity on public.products
for each row execute function public.sync_inventory_location_balance_from_product();
