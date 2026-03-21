-- Payment Accounts table (bank, cash, etc.) for Customer/Supplier payments
-- Run after ADD_CHART_OF_ACCOUNTS.sql and ADD_CUSTOMER_PAYMENTS.sql

-- Add chart_of_account_id if table exists (link to Chart of Accounts)
-- Requires chart_of_accounts table to exist (run ADD_CHART_OF_ACCOUNTS first)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chart_of_accounts')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_accounts') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_accounts' and column_name = 'chart_of_account_id') then
      alter table public.payment_accounts add column chart_of_account_id uuid references public.chart_of_accounts(id) on delete set null;
    end if;
  end if;
end $$;

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chart_of_account_id uuid references public.chart_of_accounts(id) on delete set null,
  code text not null,
  name text not null,
  account_type text not null default 'bank',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, code)
);

create index if not exists idx_payment_accounts_org on public.payment_accounts(organization_id);

alter table public.payment_accounts enable row level security;

drop policy if exists "Users can read own org payment_accounts" on public.payment_accounts;
create policy "Users can read own org payment_accounts" on public.payment_accounts for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org payment_accounts" on public.payment_accounts;
create policy "Users can insert own org payment_accounts" on public.payment_accounts for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org payment_accounts" on public.payment_accounts;
create policy "Users can update own org payment_accounts" on public.payment_accounts for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org payment_accounts" on public.payment_accounts;
create policy "Users can delete own org payment_accounts" on public.payment_accounts for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- Seed payment accounts for testing (run for each org or use a trigger)
-- This inserts default accounts for all existing organizations
insert into public.payment_accounts (organization_id, code, name, account_type)
select o.id, 'CASH', 'Cash', 'cash'
from public.organizations o
where not exists (select 1 from public.payment_accounts pa where pa.organization_id = o.id and pa.code = 'CASH');

insert into public.payment_accounts (organization_id, code, name, account_type)
select o.id, 'BANK-MAIN', 'Main Bank Account', 'bank'
from public.organizations o
where not exists (select 1 from public.payment_accounts pa where pa.organization_id = o.id and pa.code = 'BANK-MAIN');

insert into public.payment_accounts (organization_id, code, name, account_type)
select o.id, 'BANK-MOBILE', 'Mobile Money', 'bank'
from public.organizations o
where not exists (select 1 from public.payment_accounts pa where pa.organization_id = o.id and pa.code = 'BANK-MOBILE');

insert into public.payment_accounts (organization_id, code, name, account_type)
select o.id, 'PETTY', 'Petty Cash', 'cash'
from public.organizations o
where not exists (select 1 from public.payment_accounts pa where pa.organization_id = o.id and pa.code = 'PETTY');
