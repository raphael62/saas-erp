alter table if exists public.suppliers add column if not exists code text;
alter table if exists public.suppliers add column if not exists category text;
alter table if exists public.suppliers add column if not exists mobile text;
alter table if exists public.suppliers add column if not exists city text;
alter table if exists public.suppliers add column if not exists bank_name text;
alter table if exists public.suppliers add column if not exists bank_account text;
alter table if exists public.suppliers add column if not exists bank_branch text;
alter table if exists public.suppliers add column if not exists credit_limit numeric(14, 2) not null default 0;
alter table if exists public.suppliers add column if not exists currency text not null default 'GHS';
alter table if exists public.suppliers add column if not exists supplier_status text not null default 'Active';
alter table if exists public.suppliers add column if not exists notes text;

create unique index if not exists idx_suppliers_org_code_unique
  on public.suppliers(organization_id, code)
  where code is not null and btrim(code) <> '';
