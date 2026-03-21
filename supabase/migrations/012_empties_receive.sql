do $$
declare
  customer_id_type text;
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
  if location_id_type is null then
    raise exception 'public.locations.id not found. Ensure locations table exists first.';
  end if;
  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.empties_receives (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      receive_no text not null,
      empties_receipt_no text,
      customer_id %s references public.customers(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      receive_date date not null,
      notes text,
      total_items integer not null default 0,
      total_received_qty numeric(14, 4) not null default 0,
      total_os_qty numeric(14, 4) not null default 0,
      status text not null default ''saved'',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, receive_no)
    )',
    customer_id_type,
    location_id_type
  );

  execute format(
    'create table if not exists public.empties_receive_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      empties_receive_id uuid not null references public.empties_receives(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      product_code_snapshot text,
      product_name_snapshot text,
      sold_qty numeric(14, 4) not null default 0,
      owed_qty numeric(14, 4) not null default 0,
      expected_qty numeric(14, 4) not null default 0,
      received_qty numeric(14, 4) not null default 0,
      os_qty numeric(14, 4) not null default 0,
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_empties_receives_org on public.empties_receives(organization_id);
create index if not exists idx_empties_receives_date on public.empties_receives(receive_date);
create index if not exists idx_empties_receive_lines_org on public.empties_receive_lines(organization_id);
create index if not exists idx_empties_receive_lines_receive on public.empties_receive_lines(empties_receive_id);

alter table public.empties_receives enable row level security;
alter table public.empties_receive_lines enable row level security;

drop policy if exists "Users can read own org empties_receives" on public.empties_receives;
create policy "Users can read own org empties_receives" on public.empties_receives for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org empties_receives" on public.empties_receives;
create policy "Users can insert own org empties_receives" on public.empties_receives for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org empties_receives" on public.empties_receives;
create policy "Users can update own org empties_receives" on public.empties_receives for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org empties_receives" on public.empties_receives;
create policy "Users can delete own org empties_receives" on public.empties_receives for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org empties_receive_lines" on public.empties_receive_lines;
create policy "Users can read own org empties_receive_lines" on public.empties_receive_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org empties_receive_lines" on public.empties_receive_lines;
create policy "Users can insert own org empties_receive_lines" on public.empties_receive_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org empties_receive_lines" on public.empties_receive_lines;
create policy "Users can update own org empties_receive_lines" on public.empties_receive_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org empties_receive_lines" on public.empties_receive_lines;
create policy "Users can delete own org empties_receive_lines" on public.empties_receive_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_empties_receive_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_empties_receives_updated_at on public.empties_receives;
create trigger trg_empties_receives_updated_at
before update on public.empties_receives
for each row
execute function public.set_empties_receive_updated_at();

drop trigger if exists trg_empties_receive_lines_updated_at on public.empties_receive_lines;
create trigger trg_empties_receive_lines_updated_at
before update on public.empties_receive_lines
for each row
execute function public.set_empties_receive_updated_at();
