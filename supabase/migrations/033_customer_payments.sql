-- Customer payments table (multi-tenant)
-- Depends on: organizations, customers

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_no text not null,
  customer_id uuid references public.customers(id) on delete set null,
  payment_date date not null,
  bank_date date,
  payment_account text,
  amount numeric(14, 2) not null default 0,
  payment_method text not null default 'Cash',
  reference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, payment_no)
);

create index if not exists idx_customer_payments_org on public.customer_payments(organization_id);
create index if not exists idx_customer_payments_customer on public.customer_payments(customer_id);
create index if not exists idx_customer_payments_date on public.customer_payments(payment_date);

alter table public.customer_payments enable row level security;

drop policy if exists "Users can read own org customer_payments" on public.customer_payments;
create policy "Users can read own org customer_payments" on public.customer_payments for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org customer_payments" on public.customer_payments;
create policy "Users can insert own org customer_payments" on public.customer_payments for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org customer_payments" on public.customer_payments;
create policy "Users can update own org customer_payments" on public.customer_payments for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org customer_payments" on public.customer_payments;
create policy "Users can delete own org customer_payments" on public.customer_payments for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
