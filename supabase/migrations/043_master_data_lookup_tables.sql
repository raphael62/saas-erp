-- Master data lookup tables (Preferences > Master Data, location type picker, etc.).
-- Previously only in ADD_MASTER_DATA_LOOKUPS.sql; dev/prod DBs that only ran migrations were missing these.

-- Brand / Product categories
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

-- RLS + org-scoped policies (same as migration 039; uses get_my_org_id())
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
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "p_read_%s" on public.%I', t, t);
    execute format(
      'create policy "p_read_%s" on public.%I for select using (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_insert_%s" on public.%I', t, t);
    execute format(
      'create policy "p_insert_%s" on public.%I for insert with check (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_update_%s" on public.%I', t, t);
    execute format(
      'create policy "p_update_%s" on public.%I for update using (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_delete_%s" on public.%I', t, t);
    execute format(
      'create policy "p_delete_%s" on public.%I for delete using (organization_id = public.get_my_org_id())',
      t, t
    );
  end loop;
end $$;

-- Hint PostgREST to reload (fixes "could not find table in schema cache" after create)
select pg_notify('pgrst', 'reload schema');
