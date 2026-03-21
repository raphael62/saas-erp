-- Chart of Accounts (Ghana GRA-compliant)
-- Run after ADD_PAYMENT_ACCOUNTS.sql or organizations/profiles

-- Add tree columns if table already exists (from an earlier run without parent_id/dr_cr)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chart_of_accounts') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chart_of_accounts' and column_name = 'parent_id') then
      alter table public.chart_of_accounts add column parent_id uuid references public.chart_of_accounts(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chart_of_accounts' and column_name = 'dr_cr') then
      alter table public.chart_of_accounts add column dr_cr text not null default 'Dr';
      alter table public.chart_of_accounts add constraint chart_of_accounts_dr_cr_check check (dr_cr in ('Dr', 'Cr'));
    end if;
  end if;
end $$;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.chart_of_accounts(id) on delete set null,
  account_code text not null,
  account_name text not null,
  account_type text not null,
  sub_type text,
  dr_cr text not null default 'Dr' check (dr_cr in ('Dr', 'Cr')),
  opening_balance_ghs numeric(18, 2) default 0,
  current_balance_ghs numeric(18, 2) default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, account_code)
);

create index if not exists idx_chart_of_accounts_org on public.chart_of_accounts(organization_id);
create index if not exists idx_chart_of_accounts_type on public.chart_of_accounts(organization_id, account_type);
create index if not exists idx_chart_of_accounts_parent on public.chart_of_accounts(parent_id);

alter table public.chart_of_accounts enable row level security;

drop policy if exists "Users can read own org chart_of_accounts" on public.chart_of_accounts;
create policy "Users can read own org chart_of_accounts" on public.chart_of_accounts for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org chart_of_accounts" on public.chart_of_accounts;
create policy "Users can insert own org chart_of_accounts" on public.chart_of_accounts for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org chart_of_accounts" on public.chart_of_accounts;
create policy "Users can update own org chart_of_accounts" on public.chart_of_accounts for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org chart_of_accounts" on public.chart_of_accounts;
create policy "Users can delete own org chart_of_accounts" on public.chart_of_accounts for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- Seed Ghana GRA-compliant accounts for all existing organizations
-- Assets (1xxx) - light blue
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '1001', 'Cash at Bank', 'Asset', 'Current Assets' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '1001');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '1002', 'Petty Cash', 'Asset', 'Current Assets' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '1002');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '1101', 'Accounts Receivable', 'Asset', 'Current Assets' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '1101');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '1201', 'Inventory', 'Asset', 'Current Assets' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '1201');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '1501', 'Property, Plant & Equipment', 'Asset', 'Fixed Assets' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '1501');

-- Liabilities (2xxx) - light pink
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '2001', 'Accounts Payable', 'Liability', 'Current Liabilities' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '2001');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '2002', 'VAT Payable', 'Liability', 'Current Liabilities' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '2002');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '2101', 'Bank Overdraft', 'Liability', 'Current Liabilities' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '2101');

-- Equity (3xxx) - light purple
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '3001', 'Share Capital', 'Equity', 'Owner''s Equity' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '3001');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '3101', 'Retained Earnings', 'Equity', 'Retained Earnings' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '3101');

-- Revenue (4xxx) - light green
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '4001', 'Sales Revenue', 'Revenue', 'Sales' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '4001');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '4101', 'Other Income', 'Revenue', 'Other Revenue' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '4101');

-- COGS (5xxx) - light orange
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '5001', 'Cost of Goods Sold', 'Cost of Goods Sold', 'Direct Costs' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '5001');

-- Expenses (6xxx) - light yellow
insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '6001', 'Salaries and Wages', 'Expense', 'Operating Expenses' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '6001');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '6002', 'Rent Expense', 'Expense', 'Operating Expenses' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '6002');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '6003', 'Utilities', 'Expense', 'Operating Expenses' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '6003');

insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type)
select o.id, '6101', 'Administrative Expenses', 'Expense', 'Administrative' from public.organizations o
where not exists (select 1 from public.chart_of_accounts c where c.organization_id = o.id and c.account_code = '6101');
