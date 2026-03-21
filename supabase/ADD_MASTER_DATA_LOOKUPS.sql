-- Master data lookup tables (Preferences > Master Data Settings)
-- Run after ADD_PRODUCTS_AND_ORG.sql

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

-- Empties types (crate, bottle, etc.)
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

-- Price types (wholesale, retail, special)
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

-- Units of measure (pcs, box, kg, L, etc.)
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

-- Payment methods (cash, cheque, transfer, card, etc.)
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

-- Location types
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

-- Customer groups
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

-- Customer types (retail, wholesale, corporate)
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

-- RLS for all
do $$
declare t text;
begin
  foreach t in array array['brand_categories','empties_types','price_types','units_of_measure','payment_methods','location_types','customer_groups','customer_types']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "p_read_%s" on public.%I', t, t);
    execute format('create policy "p_read_%s" on public.%I for select using (organization_id in (select organization_id from public.profiles where id = auth.uid()))', t, t);
    execute format('drop policy if exists "p_insert_%s" on public.%I', t, t);
    execute format('create policy "p_insert_%s" on public.%I for insert with check (organization_id in (select organization_id from public.profiles where id = auth.uid()))', t, t);
    execute format('drop policy if exists "p_update_%s" on public.%I', t, t);
    execute format('create policy "p_update_%s" on public.%I for update using (organization_id in (select organization_id from public.profiles where id = auth.uid()))', t, t);
    execute format('drop policy if exists "p_delete_%s" on public.%I', t, t);
    execute format('create policy "p_delete_%s" on public.%I for delete using (organization_id in (select organization_id from public.profiles where id = auth.uid()))', t, t);
  end loop;
end $$;
