-- Run this in Supabase SQL Editor
-- Adds purchase invoice tables.
-- NOTE:
--   This script auto-detects referenced id types for suppliers, locations, and products.

do $$
declare
  supplier_id_type text;
  location_id_type text;
  product_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into supplier_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'suppliers'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into location_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'locations'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into product_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if supplier_id_type is null then
    raise exception 'public.suppliers.id not found. Ensure suppliers table exists first.';
  end if;
  if location_id_type is null then
    raise exception 'public.locations.id not found. Ensure locations table exists first.';
  end if;
  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.purchase_invoices (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      invoice_no text not null,
      supplier_id %s references public.suppliers(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      invoice_date date not null,
      delivery_date date,
      due_date date,
      payment_date date,
      supplier_inv_no text,
      empties_inv_no text,
      pi_no text,
      delivery_note_no text,
      transporter text,
      driver_name text,
      vehicle_no text,
      print_qty text,
      notes text,
      balance_os numeric(14, 2) not null default 0,
      total_qty numeric(14, 4) not null default 0,
      sub_total numeric(14, 2) not null default 0,
      tax_total numeric(14, 2) not null default 0,
      grand_total numeric(14, 2) not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, invoice_no)
    )',
    supplier_id_type,
    location_id_type
  );

  execute format(
    'create table if not exists public.purchase_invoice_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      purchase_invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      item_name_snapshot text,
      pack_unit numeric(14, 2) not null default 0,
      btl_qty numeric(14, 2) not null default 0,
      ctn_qty numeric(14, 4) not null default 0,
      btl_gross_bill numeric(14, 2) not null default 0,
      btl_gross_value numeric(14, 2) not null default 0,
      price_ex numeric(14, 6) not null default 0,
      pre_tax numeric(14, 2) not null default 0,
      tax_amount numeric(14, 2) not null default 0,
      price_tax_inc numeric(14, 2) not null default 0,
      tax_inc_value numeric(14, 2) not null default 0,
      empties_value numeric(14, 2) not null default 0,
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_purchase_invoices_org on public.purchase_invoices(organization_id);
create index if not exists idx_purchase_invoices_invoice_date on public.purchase_invoices(invoice_date);
create index if not exists idx_purchase_invoice_lines_org on public.purchase_invoice_lines(organization_id);
create index if not exists idx_purchase_invoice_lines_invoice on public.purchase_invoice_lines(purchase_invoice_id);

alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoice_lines enable row level security;

drop policy if exists "Users can read own org purchase_invoices" on public.purchase_invoices;
create policy "Users can read own org purchase_invoices" on public.purchase_invoices for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org purchase_invoices" on public.purchase_invoices;
create policy "Users can insert own org purchase_invoices" on public.purchase_invoices for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org purchase_invoices" on public.purchase_invoices;
create policy "Users can update own org purchase_invoices" on public.purchase_invoices for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org purchase_invoices" on public.purchase_invoices;
create policy "Users can delete own org purchase_invoices" on public.purchase_invoices for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org purchase_invoice_lines" on public.purchase_invoice_lines;
create policy "Users can read own org purchase_invoice_lines" on public.purchase_invoice_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org purchase_invoice_lines" on public.purchase_invoice_lines;
create policy "Users can insert own org purchase_invoice_lines" on public.purchase_invoice_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org purchase_invoice_lines" on public.purchase_invoice_lines;
create policy "Users can update own org purchase_invoice_lines" on public.purchase_invoice_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org purchase_invoice_lines" on public.purchase_invoice_lines;
create policy "Users can delete own org purchase_invoice_lines" on public.purchase_invoice_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_purchase_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_purchase_invoices_updated_at on public.purchase_invoices;
create trigger trg_purchase_invoices_updated_at
before update on public.purchase_invoices
for each row
execute function public.set_purchase_invoice_updated_at();

drop trigger if exists trg_purchase_invoice_lines_updated_at on public.purchase_invoice_lines;
create trigger trg_purchase_invoice_lines_updated_at
before update on public.purchase_invoice_lines
for each row
execute function public.set_purchase_invoice_updated_at();
