-- Sales targets: SSR monthly value target + commission, VSR monthly product qty/value targets

do $$
declare
  sales_rep_id_type text;
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
  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  execute format(
    'create table if not exists public.sales_ssr_monthly_targets (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      sales_rep_id %s not null references public.sales_reps(id) on delete cascade,
      month_start date not null,
      target_value numeric(14, 2) not null default 0,
      commission_pct numeric(8, 4) not null default 0,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, sales_rep_id, month_start)
    )',
    sales_rep_id_type
  );

  execute format(
    'create table if not exists public.sales_vsr_monthly_targets (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      sales_rep_id %s not null references public.sales_reps(id) on delete cascade,
      month_start date not null,
      commission_pct numeric(8, 4) not null default 0,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, sales_rep_id, month_start)
    )',
    sales_rep_id_type
  );

  execute format(
    'create table if not exists public.sales_vsr_monthly_target_lines (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      vsr_monthly_target_id uuid not null references public.sales_vsr_monthly_targets(id) on delete cascade,
      product_id %s not null references public.products(id) on delete cascade,
      target_qty numeric(14, 4) not null default 0,
      target_value numeric(14, 2) not null default 0,
      row_no integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (vsr_monthly_target_id, product_id)
    )',
    product_id_type
  );
end $$;

alter table if exists public.sales_vsr_monthly_targets
  add column if not exists commission_pct numeric(8, 4) not null default 0;

create index if not exists idx_sales_ssr_monthly_targets_org on public.sales_ssr_monthly_targets(organization_id);
create index if not exists idx_sales_ssr_monthly_targets_month on public.sales_ssr_monthly_targets(month_start);
create index if not exists idx_sales_vsr_monthly_targets_org on public.sales_vsr_monthly_targets(organization_id);
create index if not exists idx_sales_vsr_monthly_targets_month on public.sales_vsr_monthly_targets(month_start);
create index if not exists idx_sales_vsr_monthly_target_lines_org on public.sales_vsr_monthly_target_lines(organization_id);
create index if not exists idx_sales_vsr_monthly_target_lines_target on public.sales_vsr_monthly_target_lines(vsr_monthly_target_id);

alter table public.sales_ssr_monthly_targets enable row level security;
alter table public.sales_vsr_monthly_targets enable row level security;
alter table public.sales_vsr_monthly_target_lines enable row level security;

drop policy if exists "Users can read own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets;
create policy "Users can read own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets;
create policy "Users can insert own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets;
create policy "Users can update own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets;
create policy "Users can delete own org sales_ssr_monthly_targets" on public.sales_ssr_monthly_targets for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets;
create policy "Users can read own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets;
create policy "Users can insert own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets;
create policy "Users can update own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets;
create policy "Users can delete own org sales_vsr_monthly_targets" on public.sales_vsr_monthly_targets for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines;
create policy "Users can read own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines;
create policy "Users can insert own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines;
create policy "Users can update own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines;
create policy "Users can delete own org sales_vsr_monthly_target_lines" on public.sales_vsr_monthly_target_lines for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_sales_targets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_ssr_monthly_targets_updated_at on public.sales_ssr_monthly_targets;
create trigger trg_sales_ssr_monthly_targets_updated_at
before update on public.sales_ssr_monthly_targets
for each row
execute function public.set_sales_targets_updated_at();

drop trigger if exists trg_sales_vsr_monthly_targets_updated_at on public.sales_vsr_monthly_targets;
create trigger trg_sales_vsr_monthly_targets_updated_at
before update on public.sales_vsr_monthly_targets
for each row
execute function public.set_sales_targets_updated_at();

drop trigger if exists trg_sales_vsr_monthly_target_lines_updated_at on public.sales_vsr_monthly_target_lines;
create trigger trg_sales_vsr_monthly_target_lines_updated_at
before update on public.sales_vsr_monthly_target_lines
for each row
execute function public.set_sales_targets_updated_at();
