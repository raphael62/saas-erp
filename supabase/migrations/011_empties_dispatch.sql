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
    'create table if not exists public.empties_dispatches (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      dispatch_no text not null,
      supplier_id %s references public.suppliers(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      dispatch_date date not null,
      credit_note_date date,
      dispatch_note_no text,
      credit_note_no text,
      po_number text,
      delivery_note text,
      notes text,
      total_qty numeric(14, 4) not null default 0,
      total_value numeric(14, 2) not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, dispatch_no)
    )',
    supplier_id_type,
    location_id_type
  );

  execute format(
    'create table if not exists public.empties_dispatch_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      empties_dispatch_id uuid not null references public.empties_dispatches(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      product_code_snapshot text,
      product_name_snapshot text,
      empties_type text,
      qty numeric(14, 4) not null default 0,
      unit_price numeric(14, 2) not null default 0,
      total_value numeric(14, 2) not null default 0,
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_empties_dispatches_org on public.empties_dispatches(organization_id);
create index if not exists idx_empties_dispatches_date on public.empties_dispatches(dispatch_date);
create index if not exists idx_empties_dispatch_lines_org on public.empties_dispatch_lines(organization_id);
create index if not exists idx_empties_dispatch_lines_dispatch on public.empties_dispatch_lines(empties_dispatch_id);

alter table public.empties_dispatches enable row level security;
alter table public.empties_dispatch_lines enable row level security;

drop policy if exists "Users can read own org empties_dispatches" on public.empties_dispatches;
create policy "Users can read own org empties_dispatches" on public.empties_dispatches for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org empties_dispatches" on public.empties_dispatches;
create policy "Users can insert own org empties_dispatches" on public.empties_dispatches for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org empties_dispatches" on public.empties_dispatches;
create policy "Users can update own org empties_dispatches" on public.empties_dispatches for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org empties_dispatches" on public.empties_dispatches;
create policy "Users can delete own org empties_dispatches" on public.empties_dispatches for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org empties_dispatch_lines" on public.empties_dispatch_lines;
create policy "Users can read own org empties_dispatch_lines" on public.empties_dispatch_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org empties_dispatch_lines" on public.empties_dispatch_lines;
create policy "Users can insert own org empties_dispatch_lines" on public.empties_dispatch_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org empties_dispatch_lines" on public.empties_dispatch_lines;
create policy "Users can update own org empties_dispatch_lines" on public.empties_dispatch_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org empties_dispatch_lines" on public.empties_dispatch_lines;
create policy "Users can delete own org empties_dispatch_lines" on public.empties_dispatch_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_empties_dispatch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_empties_dispatches_updated_at on public.empties_dispatches;
create trigger trg_empties_dispatches_updated_at
before update on public.empties_dispatches
for each row
execute function public.set_empties_dispatch_updated_at();

drop trigger if exists trg_empties_dispatch_lines_updated_at on public.empties_dispatch_lines;
create trigger trg_empties_dispatch_lines_updated_at
before update on public.empties_dispatch_lines
for each row
execute function public.set_empties_dispatch_updated_at();
