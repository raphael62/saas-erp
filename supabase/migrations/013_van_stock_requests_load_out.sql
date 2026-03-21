-- Van stock requests + load out sheets (sales / van loading workflow)

do $$
declare
  sales_rep_id_type text;
  location_id_type text;
  product_id_type text;
begin
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
    'create table if not exists public.van_stock_requests (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      request_no text not null,
      sales_rep_id %s references public.sales_reps(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      request_date date not null,
      needed_for_date date,
      request_type text not null default ''top_up''
        check (request_type in (''top_up'', ''second_load'', ''returns'', ''add_request'')),
      status text not null default ''draft''
        check (status in (''draft'', ''pending_approval'', ''approved'', ''rejected'')),
      notes text,
      total_items integer not null default 0,
      total_qty numeric(14, 4) not null default 0,
      submitted_at timestamptz,
      approved_at timestamptz,
      approved_by uuid references public.profiles(id) on delete set null,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, request_no)
    )',
    sales_rep_id_type,
    location_id_type
  );

  execute format(
    'create table if not exists public.van_stock_request_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      van_stock_request_id uuid not null references public.van_stock_requests(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      product_code_snapshot text,
      product_name_snapshot text,
      qty_ctn numeric(14, 4) not null default 0,
      row_no integer not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );

  execute format(
    'create table if not exists public.load_out_sheets (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      sheet_no text not null,
      sales_rep_id %s references public.sales_reps(id) on delete set null,
      location_id %s references public.locations(id) on delete set null,
      sales_date date not null,
      vehicle_no text,
      driver_name text,
      daily_target numeric(14, 4) not null default 0,
      status text not null default ''draft''
        check (status in (''draft'', ''submitted'')),
      notes text,
      total_loadout_qty numeric(14, 4) not null default 0,
      total_van_sales_qty numeric(14, 4) not null default 0,
      total_sales_value numeric(14, 2) not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, sheet_no)
    )',
    sales_rep_id_type,
    location_id_type
  );

  execute
    'create table if not exists public.load_out_sheet_stock_requests (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      load_out_sheet_id uuid not null references public.load_out_sheets(id) on delete cascade,
      van_stock_request_id uuid not null references public.van_stock_requests(id) on delete cascade,
      created_at timestamptz default now(),
      unique (load_out_sheet_id, van_stock_request_id)
    )';

  execute format(
    'create table if not exists public.load_out_sheet_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      load_out_sheet_id uuid not null references public.load_out_sheets(id) on delete cascade,
      product_id %s references public.products(id) on delete set null,
      product_code_snapshot text,
      product_name_snapshot text,
      unit text not null default ''CTN'',
      source_request_no text,
      load_out_qty numeric(14, 4) not null default 0,
      top_up_qty numeric(14, 4),
      second_load_qty numeric(14, 4),
      add_req_qty numeric(14, 4),
      van_stocks_qty numeric(14, 4),
      returns_qty numeric(14, 4) not null default 0,
      van_sales_qty numeric(14, 4) not null default 0,
      unit_price numeric(14, 4) not null default 0,
      sales_value numeric(14, 2) not null default 0,
      row_no integer not null default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type
  );
end $$;

create index if not exists idx_van_stock_requests_org on public.van_stock_requests(organization_id);
create index if not exists idx_van_stock_requests_date on public.van_stock_requests(request_date);
create index if not exists idx_van_stock_request_lines_org on public.van_stock_request_lines(organization_id);
create index if not exists idx_van_stock_request_lines_req on public.van_stock_request_lines(van_stock_request_id);

create index if not exists idx_load_out_sheets_org on public.load_out_sheets(organization_id);
create index if not exists idx_load_out_sheets_date on public.load_out_sheets(sales_date);
create index if not exists idx_load_out_sheet_lines_org on public.load_out_sheet_lines(organization_id);
create index if not exists idx_load_out_sheet_lines_sheet on public.load_out_sheet_lines(load_out_sheet_id);
create index if not exists idx_load_out_sheet_stock_requests_sheet on public.load_out_sheet_stock_requests(load_out_sheet_id);

alter table public.van_stock_requests enable row level security;
alter table public.van_stock_request_lines enable row level security;
alter table public.load_out_sheets enable row level security;
alter table public.load_out_sheet_lines enable row level security;
alter table public.load_out_sheet_stock_requests enable row level security;

drop policy if exists "Users can read own org van_stock_requests" on public.van_stock_requests;
create policy "Users can read own org van_stock_requests" on public.van_stock_requests for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org van_stock_requests" on public.van_stock_requests;
create policy "Users can insert own org van_stock_requests" on public.van_stock_requests for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org van_stock_requests" on public.van_stock_requests;
create policy "Users can update own org van_stock_requests" on public.van_stock_requests for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org van_stock_requests" on public.van_stock_requests;
create policy "Users can delete own org van_stock_requests" on public.van_stock_requests for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org van_stock_request_lines" on public.van_stock_request_lines;
create policy "Users can read own org van_stock_request_lines" on public.van_stock_request_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org van_stock_request_lines" on public.van_stock_request_lines;
create policy "Users can insert own org van_stock_request_lines" on public.van_stock_request_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org van_stock_request_lines" on public.van_stock_request_lines;
create policy "Users can update own org van_stock_request_lines" on public.van_stock_request_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org van_stock_request_lines" on public.van_stock_request_lines;
create policy "Users can delete own org van_stock_request_lines" on public.van_stock_request_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org load_out_sheets" on public.load_out_sheets;
create policy "Users can read own org load_out_sheets" on public.load_out_sheets for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org load_out_sheets" on public.load_out_sheets;
create policy "Users can insert own org load_out_sheets" on public.load_out_sheets for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org load_out_sheets" on public.load_out_sheets;
create policy "Users can update own org load_out_sheets" on public.load_out_sheets for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org load_out_sheets" on public.load_out_sheets;
create policy "Users can delete own org load_out_sheets" on public.load_out_sheets for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org load_out_sheet_lines" on public.load_out_sheet_lines;
create policy "Users can read own org load_out_sheet_lines" on public.load_out_sheet_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org load_out_sheet_lines" on public.load_out_sheet_lines;
create policy "Users can insert own org load_out_sheet_lines" on public.load_out_sheet_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org load_out_sheet_lines" on public.load_out_sheet_lines;
create policy "Users can update own org load_out_sheet_lines" on public.load_out_sheet_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org load_out_sheet_lines" on public.load_out_sheet_lines;
create policy "Users can delete own org load_out_sheet_lines" on public.load_out_sheet_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests;
create policy "Users can read own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests;
create policy "Users can insert own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests;
create policy "Users can update own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests;
create policy "Users can delete own org load_out_sheet_stock_requests" on public.load_out_sheet_stock_requests for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_van_sales_doc_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_van_stock_requests_updated_at on public.van_stock_requests;
create trigger trg_van_stock_requests_updated_at
before update on public.van_stock_requests
for each row
execute function public.set_van_sales_doc_updated_at();

drop trigger if exists trg_van_stock_request_lines_updated_at on public.van_stock_request_lines;
create trigger trg_van_stock_request_lines_updated_at
before update on public.van_stock_request_lines
for each row
execute function public.set_van_sales_doc_updated_at();

drop trigger if exists trg_load_out_sheets_updated_at on public.load_out_sheets;
create trigger trg_load_out_sheets_updated_at
before update on public.load_out_sheets
for each row
execute function public.set_van_sales_doc_updated_at();

drop trigger if exists trg_load_out_sheet_lines_updated_at on public.load_out_sheet_lines;
create trigger trg_load_out_sheet_lines_updated_at
before update on public.load_out_sheet_lines
for each row
execute function public.set_van_sales_doc_updated_at();
