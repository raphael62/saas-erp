-- Hold bottle-equivalent stock at the parked cart's location until checkout or cart delete.
-- product_id type matches public.products.id (uuid or integer legacy).

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
    $ddl$
    create table if not exists public.pos_parked_inventory_reservations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      pos_parked_cart_id uuid not null references public.pos_parked_carts(id) on delete cascade,
      product_id %s not null references public.products(id) on delete cascade,
      quantity numeric(14, 4) not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (pos_parked_cart_id, product_id)
    )
    $ddl$,
    product_id_type
  );
end $$;

create index if not exists idx_pos_parked_inv_res_org_product
  on public.pos_parked_inventory_reservations (organization_id, product_id);

create index if not exists idx_pos_parked_inv_res_cart
  on public.pos_parked_inventory_reservations (pos_parked_cart_id);

alter table public.pos_parked_inventory_reservations enable row level security;

drop policy if exists "pos_parked_inv_res_select" on public.pos_parked_inventory_reservations;
create policy "pos_parked_inv_res_select" on public.pos_parked_inventory_reservations
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_inv_res_insert" on public.pos_parked_inventory_reservations;
create policy "pos_parked_inv_res_insert" on public.pos_parked_inventory_reservations
  for insert with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_inv_res_update" on public.pos_parked_inventory_reservations;
create policy "pos_parked_inv_res_update" on public.pos_parked_inventory_reservations
  for update using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  )
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_inv_res_delete" on public.pos_parked_inventory_reservations;
create policy "pos_parked_inv_res_delete" on public.pos_parked_inventory_reservations
  for delete using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop trigger if exists trg_pos_parked_inv_res_updated_at on public.pos_parked_inventory_reservations;
create trigger trg_pos_parked_inv_res_updated_at
before update on public.pos_parked_inventory_reservations
for each row execute function public.set_promotions_updated_at();

select pg_notify('pgrst', 'reload schema');
