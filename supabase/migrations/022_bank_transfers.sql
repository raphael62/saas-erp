create table if not exists public.bank_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_no text not null,
  transfer_date date not null,
  from_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  to_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  reference text,
  notes text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, transfer_no)
);

create index if not exists idx_bank_transfers_org on public.bank_transfers(organization_id);
create index if not exists idx_bank_transfers_date on public.bank_transfers(transfer_date);
create index if not exists idx_bank_transfers_from on public.bank_transfers(from_account_id);
create index if not exists idx_bank_transfers_to on public.bank_transfers(to_account_id);

alter table public.bank_transfers enable row level security;

drop policy if exists "Users can read own org bank_transfers" on public.bank_transfers;
create policy "Users can read own org bank_transfers" on public.bank_transfers for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can insert own org bank_transfers" on public.bank_transfers;
create policy "Users can insert own org bank_transfers" on public.bank_transfers for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own org bank_transfers" on public.bank_transfers;
create policy "Users can update own org bank_transfers" on public.bank_transfers for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can delete own org bank_transfers" on public.bank_transfers;
create policy "Users can delete own org bank_transfers" on public.bank_transfers for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
