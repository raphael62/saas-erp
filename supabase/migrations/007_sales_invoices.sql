do $$
declare
  customer_id_type text;
  sales_rep_id_type text;
  location_id_type text;
  product_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into customer_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'customers'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into sales_rep_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'sales_reps'
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

  if customer_id_type is null then
    raise exception 'public.customers.id not found. Ensure customers table exists first.';
  end if;
  if sales_rep_id_type is null then
    raise exception 'public.sales_reps.id not found. Ensure sales_reps table exists first.';
  end if;
  if location_id_type is null then
    raise exception 'public.locations.id not found. Ensure locations table exists first.';
  end if;
  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.sales_invoices (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      invoice_no text not null,
      customer_id %s references public.customers(id) on delete set null,
      sales_rep_id %s references public.sales_reps(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      invoice_date date not null,
      delivery_date date,
      vat_invoice_no text,
      driver_name text,
      vehicle_no text,
      payment_terms text,
      type_status text not null default ''pending'',
      notes text,
      balance_os numeric(14, 2) not null default 0,
      total_qty numeric(14, 2) not null default 0,
      sub_total numeric(14, 2) not null default 0,
      tax_total numeric(14, 2) not null default 0,
      grand_total numeric(14, 2) not null default 0,
      posted_at timestamptz,
      posted_by uuid references auth.users(id) on delete set null,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, invoice_no)
    )',
    customer_id_type,
    sales_rep_id_type,
    location_id_type
  );

  execute format(
    'create table if not exists public.sales_invoice_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      sales_invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      item_name_snapshot text,
      price_type text,
      pack_unit numeric(14, 2) not null default 0,
      qty numeric(14, 2) not null default 0,
      cl_qty numeric(14, 2) not null default 0,
      free_qty numeric(14, 2) not null default 0,
      price_ex numeric(14, 2) not null default 0,
      price_tax_inc numeric(14, 2) not null default 0,
      tax_rate numeric(7, 3) not null default 0,
      tax_amount numeric(14, 2) not null default 0,
      value_tax_inc numeric(14, 2) not null default 0,
      vat_type text not null default ''inc'',
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_sales_invoices_org on public.sales_invoices(organization_id);
create index if not exists idx_sales_invoices_invoice_date on public.sales_invoices(invoice_date);
create index if not exists idx_sales_invoice_lines_org on public.sales_invoice_lines(organization_id);
create index if not exists idx_sales_invoice_lines_invoice on public.sales_invoice_lines(sales_invoice_id);

alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_lines enable row level security;

drop policy if exists "Users can read own org sales_invoices" on public.sales_invoices;
create policy "Users can read own org sales_invoices" on public.sales_invoices for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_invoices" on public.sales_invoices;
create policy "Users can insert own org sales_invoices" on public.sales_invoices for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_invoices" on public.sales_invoices;
create policy "Users can update own org sales_invoices" on public.sales_invoices for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_invoices" on public.sales_invoices;
create policy "Users can delete own org sales_invoices" on public.sales_invoices for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can read own org sales_invoice_lines" on public.sales_invoice_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can insert own org sales_invoice_lines" on public.sales_invoice_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can update own org sales_invoice_lines" on public.sales_invoice_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can delete own org sales_invoice_lines" on public.sales_invoice_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_sales_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_invoices_updated_at on public.sales_invoices;
create trigger trg_sales_invoices_updated_at
before update on public.sales_invoices
for each row
execute function public.set_sales_invoice_updated_at();

drop trigger if exists trg_sales_invoice_lines_updated_at on public.sales_invoice_lines;
create trigger trg_sales_invoice_lines_updated_at
before update on public.sales_invoice_lines
for each row
execute function public.set_sales_invoice_updated_at();
