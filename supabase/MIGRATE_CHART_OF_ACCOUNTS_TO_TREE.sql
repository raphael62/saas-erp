-- Migrate chart_of_accounts to tree structure (parent-child hierarchy)
-- Run after ADD_CHART_OF_ACCOUNTS.sql

-- 1. Add new columns
alter table public.chart_of_accounts
  add column if not exists parent_id uuid references public.chart_of_accounts(id) on delete set null,
  add column if not exists dr_cr text not null default 'Dr' check (dr_cr in ('Dr', 'Cr'));

create index if not exists idx_chart_of_accounts_parent on public.chart_of_accounts(parent_id);

-- 2. Set dr_cr based on account_type (Cr for Liabilities, Equity, Revenue)
update public.chart_of_accounts
set dr_cr = 'Cr'
where account_type in ('Liability', 'Equity', 'Revenue');

-- 3. Create parent/group accounts and link existing accounts
-- Uses a per-org approach: for each org, create parents then update children

do $$
declare
  r record;
  id_1000 uuid;
  id_1010 uuid;
  id_1011 uuid;
  id_1020 uuid;
begin
  for r in select distinct organization_id from public.chart_of_accounts
  loop
    -- Level 1: Root categories (1000 Assets, 2000 Liabilities, etc.)
    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '1000', 'Assets', 'Asset', null, 'Dr')
    on conflict (organization_id, account_code) do nothing;

    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '2000', 'Liabilities', 'Liability', null, 'Cr')
    on conflict (organization_id, account_code) do nothing;

    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '3000', 'Equity', 'Equity', null, 'Cr')
    on conflict (organization_id, account_code) do nothing;

    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '4000', 'Revenue', 'Revenue', null, 'Cr')
    on conflict (organization_id, account_code) do nothing;

    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '5000', 'Cost of Goods Sold', 'Cost of Goods Sold', null, 'Dr')
    on conflict (organization_id, account_code) do nothing;

    insert into public.chart_of_accounts (organization_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, '6000', 'Expenses', 'Expense', null, 'Dr')
    on conflict (organization_id, account_code) do nothing;

    -- Level 2: Sub-categories
    select id into id_1000 from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1000';
    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, id_1000, '1010', 'Current Assets', 'Asset', 'Current Assets', 'Dr')
    on conflict (organization_id, account_code) do update set parent_id = id_1000;

    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, id_1000, '1020', 'Fixed Assets', 'Asset', 'Fixed Assets', 'Dr')
    on conflict (organization_id, account_code) do update set parent_id = id_1000;

    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '2000'), '2010', 'Current Liabilities', 'Liability', 'Current Liabilities', 'Cr')
    on conflict (organization_id, account_code) do update set parent_id = excluded.parent_id;

    -- Level 3: Groups under Current Assets
    select id into id_1010 from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1010';
    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, id_1010, '1011', 'Cash and Cash Equivalents', 'Asset', null, 'Dr')
    on conflict (organization_id, account_code) do update set parent_id = id_1010;

    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, id_1010, '1012', 'Receivables and Inventory', 'Asset', null, 'Dr')
    on conflict (organization_id, account_code) do update set parent_id = id_1010;

    select id into id_1020 from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1020';
    insert into public.chart_of_accounts (organization_id, parent_id, account_code, account_name, account_type, sub_type, dr_cr)
    values (r.organization_id, id_1020, '1021', 'Property, Plant & Equipment', 'Asset', null, 'Dr')
    on conflict (organization_id, account_code) do update set parent_id = id_1020;

    -- Link existing leaf accounts to parents
    select id into id_1011 from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1011';
    update public.chart_of_accounts set parent_id = id_1011
    where organization_id = r.organization_id and account_code in ('1001','1002');

    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1012')
    where organization_id = r.organization_id and account_code in ('1101','1201');

    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '1021')
    where organization_id = r.organization_id and account_code = '1501';

    -- Liabilities
    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '2010')
    where organization_id = r.organization_id and account_code in ('2001','2002','2101');

    -- Equity
    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '3000')
    where organization_id = r.organization_id and account_code in ('3001','3101');

    -- Revenue
    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '4000')
    where organization_id = r.organization_id and account_code in ('4001','4101');

    -- COGS
    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '5000')
    where organization_id = r.organization_id and account_code = '5001';

    -- Expenses
    update public.chart_of_accounts set parent_id = (select id from public.chart_of_accounts where organization_id = r.organization_id and account_code = '6000')
    where organization_id = r.organization_id and account_code in ('6001','6002','6003','6101');

  end loop;
end $$;
