-- Stock count sheets: physical count at one location; line items match location_transfer_lines shape.

create table if not exists public.stock_count_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sheet_no text not null,
  count_date date not null default current_date,
  location_id uuid not null references public.locations(id) on delete restrict,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, sheet_no)
);

create index if not exists idx_stock_count_sheets_org on public.stock_count_sheets(organization_id);
create index if not exists idx_stock_count_sheets_date on public.stock_count_sheets(count_date);
create index if not exists idx_stock_count_sheets_location on public.stock_count_sheets(location_id);

alter table public.stock_count_sheets enable row level security;

drop policy if exists "Users can read own org stock_count_sheets" on public.stock_count_sheets;
create policy "Users can read own org stock_count_sheets" on public.stock_count_sheets for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org stock_count_sheets" on public.stock_count_sheets;
create policy "Users can insert own org stock_count_sheets" on public.stock_count_sheets for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org stock_count_sheets" on public.stock_count_sheets;
create policy "Users can update own org stock_count_sheets" on public.stock_count_sheets for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org stock_count_sheets" on public.stock_count_sheets;
create policy "Users can delete own org stock_count_sheets" on public.stock_count_sheets for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_stock_count_sheets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_count_sheets_updated_at on public.stock_count_sheets;
create trigger trg_stock_count_sheets_updated_at
before update on public.stock_count_sheets
for each row execute function public.set_stock_count_sheets_updated_at();

-- Lines: same columns as location_transfer_lines (product, cartons, bottles, ctn_qty, notes, row_no)
do $$
declare
  product_id_type text;
begin
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

  if product_id_type is null then
    raise exception 'public.products.id not found.';
  end if;

  if to_regclass('public.stock_count_lines') is null then
    execute format(
      'create table public.stock_count_lines (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        stock_count_sheet_id uuid not null references public.stock_count_sheets(id) on delete cascade,
        product_id %s not null,
        cartons numeric(14, 2) not null default 0,
        bottles numeric(14, 2) not null default 0,
        ctn_qty numeric(14, 4) not null default 0,
        notes text,
        row_no integer not null default 0,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )',
      product_id_type
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stock_count_lines'::regclass
      and conname = 'stock_count_lines_product_id_fkey'
  ) then
    execute 'alter table public.stock_count_lines add constraint stock_count_lines_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict';
  end if;
end $$;

create index if not exists idx_stock_count_lines_org on public.stock_count_lines(organization_id);
create index if not exists idx_stock_count_lines_sheet on public.stock_count_lines(stock_count_sheet_id);
create index if not exists idx_stock_count_lines_product on public.stock_count_lines(product_id);

alter table public.stock_count_lines enable row level security;

drop policy if exists "Users can read own org stock_count_lines" on public.stock_count_lines;
create policy "Users can read own org stock_count_lines" on public.stock_count_lines for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org stock_count_lines" on public.stock_count_lines;
create policy "Users can insert own org stock_count_lines" on public.stock_count_lines for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org stock_count_lines" on public.stock_count_lines;
create policy "Users can update own org stock_count_lines" on public.stock_count_lines for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org stock_count_lines" on public.stock_count_lines;
create policy "Users can delete own org stock_count_lines" on public.stock_count_lines for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_stock_count_lines_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_count_lines_updated_at on public.stock_count_lines;
create trigger trg_stock_count_lines_updated_at
before update on public.stock_count_lines
for each row execute function public.set_stock_count_lines_updated_at();
