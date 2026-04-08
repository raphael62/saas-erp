-- Shared per-organization pick lists (driver names, vehicles, transporters, etc.) for invoice search dialogs.

create table if not exists public.organization_picklists (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  list_key text not null,
  values text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (organization_id, list_key),
  constraint organization_picklists_list_key_check check (
    list_key in (
      'sales_invoice_driver',
      'sales_invoice_vehicle',
      'purchase_invoice_transporter',
      'purchase_invoice_driver',
      'purchase_invoice_vehicle'
    )
  )
);

create table if not exists public.organization_picklist_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  list_key text not null,
  value_norm text not null,
  created_at timestamptz not null default now(),
  constraint organization_picklist_suppressions_list_key_check check (
    list_key in (
      'sales_invoice_driver',
      'sales_invoice_vehicle',
      'purchase_invoice_transporter',
      'purchase_invoice_driver',
      'purchase_invoice_vehicle'
    )
  ),
  unique (organization_id, list_key, value_norm)
);

create index if not exists idx_org_picklist_suppressions_org_list
  on public.organization_picklist_suppressions (organization_id, list_key);

alter table public.organization_picklists enable row level security;
alter table public.organization_picklist_suppressions enable row level security;

drop policy if exists "Users read org picklists" on public.organization_picklists;
create policy "Users read org picklists" on public.organization_picklists
  for select using (organization_id = public.get_my_org_id());

drop policy if exists "Users insert org picklists" on public.organization_picklists;
create policy "Users insert org picklists" on public.organization_picklists
  for insert with check (organization_id = public.get_my_org_id());

drop policy if exists "Users update org picklists" on public.organization_picklists;
create policy "Users update org picklists" on public.organization_picklists
  for update using (organization_id = public.get_my_org_id())
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users delete org picklists" on public.organization_picklists;
create policy "Users delete org picklists" on public.organization_picklists
  for delete using (organization_id = public.get_my_org_id());

drop policy if exists "Users read org picklist suppressions" on public.organization_picklist_suppressions;
create policy "Users read org picklist suppressions" on public.organization_picklist_suppressions
  for select using (organization_id = public.get_my_org_id());

drop policy if exists "Users insert org picklist suppressions" on public.organization_picklist_suppressions;
create policy "Users insert org picklist suppressions" on public.organization_picklist_suppressions
  for insert with check (organization_id = public.get_my_org_id());

drop policy if exists "Users delete org picklist suppressions" on public.organization_picklist_suppressions;
create policy "Users delete org picklist suppressions" on public.organization_picklist_suppressions
  for delete using (organization_id = public.get_my_org_id());

select pg_notify('pgrst', 'reload schema');
