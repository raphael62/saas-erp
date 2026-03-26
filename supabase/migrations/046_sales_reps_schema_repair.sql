-- Repair drifted sales_reps schema in dev databases.
-- Some environments were initialized from older scripts and miss form fields
-- (e.g. email), causing PostgREST "schema cache" column errors.

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

alter table public.sales_reps alter column is_active set default true;
alter table public.sales_reps alter column created_at set default now();
alter table public.sales_reps alter column updated_at set default now();

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

-- Refresh PostgREST schema cache so new columns are visible immediately.
select pg_notify('pgrst', 'reload schema');
