-- Location transfers (inventory module)
-- Uses dynamic FK types (some older DBs have integer products.id).
do $$
declare
  location_id_type text;
  product_id_type text;
begin
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

  if location_id_type is null then
    raise exception 'public.locations.id not found. Ensure locations table exists first.';
  end if;
  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.location_transfers (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      transfer_no text not null,
      transfer_date date not null,
      from_location_id %s not null references public.locations(id) on delete restrict,
      to_location_id %s not null references public.locations(id) on delete restrict,
      product_id %s not null references public.products(id) on delete restrict,
      qty numeric(14, 2) not null default 0,
      notes text,
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, transfer_no)
    )',
    location_id_type,
    location_id_type,
    product_id_type
  );
end $$;

create index if not exists idx_location_transfers_org on public.location_transfers(organization_id);
create index if not exists idx_location_transfers_date on public.location_transfers(transfer_date);
create index if not exists idx_location_transfers_from on public.location_transfers(from_location_id);
create index if not exists idx_location_transfers_to on public.location_transfers(to_location_id);
create index if not exists idx_location_transfers_product on public.location_transfers(product_id);

alter table public.location_transfers enable row level security;

drop policy if exists "Users can read own org location_transfers" on public.location_transfers;
create policy "Users can read own org location_transfers" on public.location_transfers for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org location_transfers" on public.location_transfers;
create policy "Users can insert own org location_transfers" on public.location_transfers for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org location_transfers" on public.location_transfers;
create policy "Users can update own org location_transfers" on public.location_transfers for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org location_transfers" on public.location_transfers;
create policy "Users can delete own org location_transfers" on public.location_transfers for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_location_transfers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_location_transfers_updated_at on public.location_transfers;
create trigger trg_location_transfers_updated_at
before update on public.location_transfers
for each row execute function public.set_location_transfers_updated_at();
