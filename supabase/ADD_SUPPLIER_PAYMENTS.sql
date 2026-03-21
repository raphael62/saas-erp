-- Supplier Payments table (multi-tenant)
-- Run after ADD_PURCHASE_INVOICES.sql, ADD_PAYMENT_ACCOUNTS.sql

do $$
declare
  supplier_id_type text;
begin
  select data_type into supplier_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'id';

  if supplier_id_type is null then
    raise exception 'public.suppliers.id not found. Ensure suppliers table exists first.';
  end if;

  execute format(
    'create table if not exists public.supplier_payments (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      payment_no text not null,
      supplier_id %s references public.suppliers(id) on delete set null,
      payment_date date not null,
      bank_date date,
      payment_account text,
      amount numeric(14, 2) not null default 0,
      payment_method text not null default ''Cash'',
      reference text,
      notes text,
      cheque_no text,
      purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, payment_no)
    )',
    supplier_id_type
  );

  create table if not exists public.supplier_payment_allocations (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    supplier_payment_id uuid not null references public.supplier_payments(id) on delete cascade,
    purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
    amount numeric(14, 2) not null default 0,
    cheque_no text,
    created_at timestamptz default now()
  );
end$$;

alter table public.supplier_payments add column if not exists cheque_no text;
alter table public.supplier_payments add column if not exists purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null;

create index if not exists idx_supplier_payments_org on public.supplier_payments(organization_id);
create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);
create index if not exists idx_supplier_payments_date on public.supplier_payments(payment_date);
create index if not exists idx_supplier_payments_purchase_invoice on public.supplier_payments(purchase_invoice_id);
create index if not exists idx_supplier_payment_allocations_org on public.supplier_payment_allocations(organization_id);
create index if not exists idx_supplier_payment_allocations_payment on public.supplier_payment_allocations(supplier_payment_id);

alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;

drop policy if exists "Users can read own org supplier_payments" on public.supplier_payments;
create policy "Users can read own org supplier_payments" on public.supplier_payments for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org supplier_payments" on public.supplier_payments;
create policy "Users can insert own org supplier_payments" on public.supplier_payments for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org supplier_payments" on public.supplier_payments;
create policy "Users can update own org supplier_payments" on public.supplier_payments for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org supplier_payments" on public.supplier_payments;
create policy "Users can delete own org supplier_payments" on public.supplier_payments for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org supplier_payment_allocations" on public.supplier_payment_allocations;
create policy "Users can read own org supplier_payment_allocations" on public.supplier_payment_allocations for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org supplier_payment_allocations" on public.supplier_payment_allocations;
create policy "Users can insert own org supplier_payment_allocations" on public.supplier_payment_allocations for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org supplier_payment_allocations" on public.supplier_payment_allocations;
create policy "Users can delete own org supplier_payment_allocations" on public.supplier_payment_allocations for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
