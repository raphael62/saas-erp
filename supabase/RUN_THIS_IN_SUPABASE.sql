-- ============================================================
-- Run this entire file in Supabase: SQL Editor → New query → Paste → Run
-- ============================================================

-- 1. Organizations (tenants)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. User profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email text,
  full_name text,
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

-- 4. Policies
drop policy if exists "Users can read own organization" on public.organizations;
create policy "Users can read own organization"
  on public.organizations for select
  using (
    id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can insert organization" on public.organizations;
create policy "Users can insert organization"
  on public.organizations for insert
  with check (true);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

-- 5. Trigger: create profile when someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Optional: run 003_products.sql and 004_organization_insert.sql
-- for Inventory (products table and org creation).
-- ============================================================
