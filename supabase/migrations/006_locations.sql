create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  phone text,
  location_type text,
  location_manager_id uuid,
  is_active boolean default true,
  enable_inventory_management boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, code)
);

do $$
declare
  sales_rep_id_type text;
  current_manager_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into sales_rep_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'sales_reps'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if sales_rep_id_type is null then
    raise exception 'public.sales_reps.id not found. Ensure sales_reps table exists first.';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into current_manager_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'locations'
    and a.attname = 'location_manager_id'
    and a.attnum > 0
    and not a.attisdropped;

  if current_manager_type is null then
    execute format(
      'alter table public.locations add column location_manager_id %s',
      sales_rep_id_type
    );
    current_manager_type := sales_rep_id_type;
  end if;

  if current_manager_type <> sales_rep_id_type then
    raise exception 'public.locations.location_manager_id type (%) does not match public.sales_reps.id type (%).', current_manager_type, sales_rep_id_type;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and conname = 'locations_location_manager_id_fkey'
  ) then
    execute 'alter table public.locations add constraint locations_location_manager_id_fkey foreign key (location_manager_id) references public.sales_reps(id) on delete set null';
  end if;
end $$;

create index if not exists idx_locations_organization on public.locations(organization_id);
create index if not exists idx_locations_code on public.locations(code);

alter table public.locations enable row level security;

drop policy if exists "Users can read own org locations" on public.locations;
create policy "Users can read own org locations"
  on public.locations for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org locations" on public.locations;
create policy "Users can insert own org locations"
  on public.locations for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org locations" on public.locations;
create policy "Users can update own org locations"
  on public.locations for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org locations" on public.locations;
create policy "Users can delete own org locations"
  on public.locations for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_locations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_locations_updated_at on public.locations;
create trigger trg_locations_updated_at
before update on public.locations
for each row
execute function public.set_locations_updated_at();
