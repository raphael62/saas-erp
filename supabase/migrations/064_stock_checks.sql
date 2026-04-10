-- Stock checks: snapshot generated when a stock count sheet is saved (van + count + system benchmark).
-- product_id type matches public.products.id (uuid or integer legacy), same pattern as inventory_location_balances / stock_count_lines.

create table if not exists public.stock_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stock_count_sheet_id uuid not null unique references public.stock_count_sheets(id) on delete cascade,
  count_date date not null,
  location_id uuid not null references public.locations(id) on delete restrict,
  van_last_sales_dates jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stock_checks_org on public.stock_checks(organization_id);
create index if not exists idx_stock_checks_location on public.stock_checks(location_id);

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
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  if to_regclass('public.stock_check_lines') is null then
    execute format(
      $ddl$
      create table public.stock_check_lines (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        stock_check_id uuid not null references public.stock_checks(id) on delete cascade,
        product_id %s not null references public.products(id) on delete cascade,
        van_qty numeric(14, 4) not null default 0,
        counted_qty numeric(14, 4) not null default 0,
        system_location_qty numeric(14, 4) not null default 0,
        combined_qty numeric(14, 4) not null default 0,
        variance_qty numeric(14, 4) not null default 0,
        row_no integer not null default 0,
        line_notes text,
        unique (stock_check_id, product_id)
      )
      $ddl$,
      product_id_type
    );
  end if;
end $$;

create index if not exists idx_stock_check_lines_org on public.stock_check_lines(organization_id);
create index if not exists idx_stock_check_lines_check on public.stock_check_lines(stock_check_id);

alter table public.stock_checks enable row level security;
alter table public.stock_check_lines enable row level security;

drop policy if exists "Users read own org stock_checks" on public.stock_checks;
create policy "Users read own org stock_checks"
  on public.stock_checks for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users insert own org stock_checks" on public.stock_checks;
create policy "Users insert own org stock_checks"
  on public.stock_checks for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users update own org stock_checks" on public.stock_checks;
create policy "Users update own org stock_checks"
  on public.stock_checks for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users delete own org stock_checks" on public.stock_checks;
create policy "Users delete own org stock_checks"
  on public.stock_checks for delete
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users read own org stock_check_lines" on public.stock_check_lines;
create policy "Users read own org stock_check_lines"
  on public.stock_check_lines for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users insert own org stock_check_lines" on public.stock_check_lines;
create policy "Users insert own org stock_check_lines"
  on public.stock_check_lines for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users update own org stock_check_lines" on public.stock_check_lines;
create policy "Users update own org stock_check_lines"
  on public.stock_check_lines for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users delete own org stock_check_lines" on public.stock_check_lines;
create policy "Users delete own org stock_check_lines"
  on public.stock_check_lines for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_stock_checks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_checks_updated_at on public.stock_checks;
create trigger trg_stock_checks_updated_at
before update on public.stock_checks
for each row execute function public.set_stock_checks_updated_at();
