-- Dev schema drift guard (idempotent).
-- Purpose: recover environments that were initialized from mixed SQL scripts vs migrations.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 0) Ensure org helper functions exist (used by RLS policies below)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_org_id()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org uuid;
begin
  perform set_config('row_security', 'off', true);
  select organization_id into v_org
  from public.profiles
  where id = auth.uid()
  limit 1;
  return v_org;
end;
$$;

create or replace function public.get_my_role()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  perform set_config('row_security', 'off', true);
  select role into v_role
  from public.profiles
  where id = auth.uid()
  limit 1;
  return v_role;
end;
$$;

grant execute on function public.get_my_org_id() to authenticated;
grant execute on function public.get_my_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Products: ensure extended columns used by app exist
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists code text;
alter table public.products add column if not exists pack_unit integer;
alter table public.products add column if not exists plastic_cost numeric(12, 2) default 0;
alter table public.products add column if not exists bottle_cost numeric(12, 2) default 0;
alter table public.products add column if not exists reorder_qty numeric(12, 2) default 0;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists supplier_id uuid;
alter table public.products add column if not exists empties_type text;
alter table public.products add column if not exists is_active boolean default true;
alter table public.products add column if not exists taxable boolean default true;
alter table public.products add column if not exists returnable boolean default false;

-- ---------------------------------------------------------------------------
-- 2) Master data lookup tables + org-scoped RLS
-- ---------------------------------------------------------------------------
create table if not exists public.brand_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.empties_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.price_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.location_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

create table if not exists public.customer_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(organization_id, code)
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'brand_categories',
    'empties_types',
    'price_types',
    'units_of_measure',
    'payment_methods',
    'location_types',
    'customer_groups',
    'customer_types'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "p_read_%s" on public.%I', t, t);
    execute format('create policy "p_read_%s" on public.%I for select using (organization_id = public.get_my_org_id())', t, t);
    execute format('drop policy if exists "p_insert_%s" on public.%I', t, t);
    execute format('create policy "p_insert_%s" on public.%I for insert with check (organization_id = public.get_my_org_id())', t, t);
    execute format('drop policy if exists "p_update_%s" on public.%I', t, t);
    execute format('create policy "p_update_%s" on public.%I for update using (organization_id = public.get_my_org_id())', t, t);
    execute format('drop policy if exists "p_delete_%s" on public.%I', t, t);
    execute format('create policy "p_delete_%s" on public.%I for delete using (organization_id = public.get_my_org_id())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Sales reps schema repair
-- ---------------------------------------------------------------------------
create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  phone text,
  email text,
  first_name text,
  last_name text,
  sales_rep_type text,
  company text,
  location text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sales_reps add column if not exists code text;
alter table public.sales_reps add column if not exists name text;
alter table public.sales_reps add column if not exists phone text;
alter table public.sales_reps add column if not exists email text;
alter table public.sales_reps add column if not exists first_name text;
alter table public.sales_reps add column if not exists last_name text;
alter table public.sales_reps add column if not exists sales_rep_type text;
alter table public.sales_reps add column if not exists company text;
alter table public.sales_reps add column if not exists location text;
alter table public.sales_reps add column if not exists is_active boolean default true;
alter table public.sales_reps add column if not exists created_at timestamptz default now();
alter table public.sales_reps add column if not exists updated_at timestamptz default now();

update public.sales_reps
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create index if not exists idx_sales_reps_organization on public.sales_reps(organization_id);
alter table public.sales_reps enable row level security;

drop policy if exists "Users can read own org sales_reps" on public.sales_reps;
create policy "Users can read own org sales_reps" on public.sales_reps for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org sales_reps" on public.sales_reps;
create policy "Users can insert own org sales_reps" on public.sales_reps for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org sales_reps" on public.sales_reps;
create policy "Users can update own org sales_reps" on public.sales_reps for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org sales_reps" on public.sales_reps;
create policy "Users can delete own org sales_reps" on public.sales_reps for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_sales_reps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_reps_updated_at on public.sales_reps;
create trigger trg_sales_reps_updated_at
before update on public.sales_reps
for each row execute function public.set_sales_reps_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Location transfers header + lines with dynamic FK types
-- ---------------------------------------------------------------------------
do $$
declare
  location_id_type text;
  product_id_type text;
  current_lt_loc_out text;
  current_lt_loc_in text;
  current_lt_product text;
begin
  select format_type(a.atttypid, a.atttypmod) into location_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'locations' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod) into product_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'products' and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  if location_id_type is null then
    raise exception 'public.locations.id not found.';
  end if;
  if product_id_type is null then
    raise exception 'public.products.id not found.';
  end if;

  if to_regclass('public.location_transfers') is null then
    execute format(
      'create table public.location_transfers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        transfer_no text not null,
        transfer_date date not null,
        from_location_id %s not null references public.locations(id) on delete restrict,
        to_location_id %s not null references public.locations(id) on delete restrict,
        product_id %s,
        qty numeric(14, 2) default 0,
        request_date date not null default current_date,
        status text not null default ''requested'',
        notes text,
        created_by uuid references auth.users(id) on delete set null,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        unique (organization_id, transfer_no)
      )',
      location_id_type, location_id_type, product_id_type
    );
  else
    alter table public.location_transfers add column if not exists request_date date;
    update public.location_transfers set request_date = coalesce(request_date, transfer_date);
    alter table public.location_transfers alter column request_date set default current_date;
    alter table public.location_transfers alter column request_date set not null;
    alter table public.location_transfers add column if not exists status text not null default 'requested';
    alter table public.location_transfers alter column product_id drop not null;
    alter table public.location_transfers alter column qty drop not null;

    select format_type(a.atttypid, a.atttypmod) into current_lt_loc_out
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='location_transfers' and a.attname='from_location_id' and a.attnum > 0 and not a.attisdropped;

    select format_type(a.atttypid, a.atttypmod) into current_lt_loc_in
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='location_transfers' and a.attname='to_location_id' and a.attnum > 0 and not a.attisdropped;

    select format_type(a.atttypid, a.atttypmod) into current_lt_product
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='location_transfers' and a.attname='product_id' and a.attnum > 0 and not a.attisdropped;

    if current_lt_loc_out is not null and current_lt_loc_out <> location_id_type then
      execute 'alter table public.location_transfers drop constraint if exists location_transfers_from_location_id_fkey';
      execute 'alter table public.location_transfers drop column if exists from_location_id';
      execute format('alter table public.location_transfers add column from_location_id %s not null', location_id_type);
      execute 'alter table public.location_transfers add constraint location_transfers_from_location_id_fkey foreign key (from_location_id) references public.locations(id) on delete restrict';
    end if;

    if current_lt_loc_in is not null and current_lt_loc_in <> location_id_type then
      execute 'alter table public.location_transfers drop constraint if exists location_transfers_to_location_id_fkey';
      execute 'alter table public.location_transfers drop column if exists to_location_id';
      execute format('alter table public.location_transfers add column to_location_id %s not null', location_id_type);
      execute 'alter table public.location_transfers add constraint location_transfers_to_location_id_fkey foreign key (to_location_id) references public.locations(id) on delete restrict';
    end if;

    if current_lt_product is not null and current_lt_product <> product_id_type then
      execute 'alter table public.location_transfers drop constraint if exists location_transfers_product_id_fkey';
      execute 'alter table public.location_transfers drop column if exists product_id';
      execute format('alter table public.location_transfers add column product_id %s', product_id_type);
      execute 'alter table public.location_transfers add constraint location_transfers_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict';
    end if;
  end if;

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
  returns trigger language plpgsql as $f$
  begin
    new.updated_at = now();
    return new;
  end;
  $f$;
  drop trigger if exists trg_location_transfers_updated_at on public.location_transfers;
  create trigger trg_location_transfers_updated_at
  before update on public.location_transfers
  for each row execute function public.set_location_transfers_updated_at();

  if to_regclass('public.location_transfer_lines') is null then
    execute format(
      'create table public.location_transfer_lines (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        location_transfer_id uuid not null references public.location_transfers(id) on delete cascade,
        product_id %s not null references public.products(id) on delete restrict,
        cartons numeric(14, 2) not null default 0,
        bottles numeric(14, 2) not null default 0,
        ctn_qty numeric(14, 4) not null default 0,
        notes text,
        row_no integer not null default 0,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )',
      product_id_type
    );
  else
    alter table public.location_transfer_lines add column if not exists cartons numeric(14, 2) not null default 0;
    alter table public.location_transfer_lines add column if not exists bottles numeric(14, 2) not null default 0;
    alter table public.location_transfer_lines add column if not exists ctn_qty numeric(14, 4) not null default 0;
    alter table public.location_transfer_lines add column if not exists notes text;
    alter table public.location_transfer_lines add column if not exists row_no integer not null default 0;
    alter table public.location_transfer_lines add column if not exists created_at timestamptz default now();
    alter table public.location_transfer_lines add column if not exists updated_at timestamptz default now();

    -- fix product_id type by replace (uuid->integer cannot cast directly)
    select format_type(a.atttypid, a.atttypmod) into current_lt_product
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='location_transfer_lines' and a.attname='product_id' and a.attnum > 0 and not a.attisdropped;

    if current_lt_product is not null and current_lt_product <> product_id_type then
      execute 'alter table public.location_transfer_lines drop constraint if exists location_transfer_lines_product_id_fkey';
      execute 'alter table public.location_transfer_lines drop column if exists product_id';
      execute format('alter table public.location_transfer_lines add column product_id %s not null', product_id_type);
      execute 'alter table public.location_transfer_lines add constraint location_transfer_lines_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict';
    end if;
  end if;

  create index if not exists idx_location_transfer_lines_org on public.location_transfer_lines(organization_id);
  create index if not exists idx_location_transfer_lines_transfer on public.location_transfer_lines(location_transfer_id);
  create index if not exists idx_location_transfer_lines_product on public.location_transfer_lines(product_id);
  alter table public.location_transfer_lines enable row level security;

  drop policy if exists "Users can read own org location_transfer_lines" on public.location_transfer_lines;
  create policy "Users can read own org location_transfer_lines" on public.location_transfer_lines for select
    using (organization_id = public.get_my_org_id());
  drop policy if exists "Users can insert own org location_transfer_lines" on public.location_transfer_lines;
  create policy "Users can insert own org location_transfer_lines" on public.location_transfer_lines for insert
    with check (organization_id = public.get_my_org_id());
  drop policy if exists "Users can update own org location_transfer_lines" on public.location_transfer_lines;
  create policy "Users can update own org location_transfer_lines" on public.location_transfer_lines for update
    using (organization_id = public.get_my_org_id());
  drop policy if exists "Users can delete own org location_transfer_lines" on public.location_transfer_lines;
  create policy "Users can delete own org location_transfer_lines" on public.location_transfer_lines for delete
    using (organization_id = public.get_my_org_id());

  create or replace function public.set_location_transfer_lines_updated_at()
  returns trigger language plpgsql as $f$
  begin
    new.updated_at = now();
    return new;
  end;
  $f$;
  drop trigger if exists trg_location_transfer_lines_updated_at on public.location_transfer_lines;
  create trigger trg_location_transfer_lines_updated_at
  before update on public.location_transfer_lines
  for each row execute function public.set_location_transfer_lines_updated_at();
end $$;

-- ---------------------------------------------------------------------------
-- 5) Ensure org subscription + profile theme fields exist
-- ---------------------------------------------------------------------------
alter table public.organizations add column if not exists subscription_ends_at timestamptz;
alter table public.profiles add column if not exists theme_accent_hex text;

-- ---------------------------------------------------------------------------
-- 6) Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
select pg_notify('pgrst', 'reload schema');
