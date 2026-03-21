-- Adds promotions tables for Buy A -> Get B rules.
-- NOTE:
--   This script auto-detects public.products.id data type and uses matching FK types.

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  promo_code text not null,
  name text not null,
  promo_budget_cartons numeric(14, 4),
  consumed_cartons numeric(14, 4) not null default 0,
  start_date date not null,
  end_date date not null,
  description text,
  is_active boolean default true,
  eligible_price_types text[] not null default '{}',
  eligible_location_ids text[] not null default '{}',
  days_of_week smallint[] not null default '{}',
  happy_hour_start time,
  happy_hour_end time,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, promo_code)
);

alter table if exists public.promotions
  add column if not exists promo_budget_cartons numeric(14, 4);
alter table if exists public.promotions
  add column if not exists consumed_cartons numeric(14, 4) not null default 0;

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

  execute format(
    'create table if not exists public.promotion_rules (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      promotion_id uuid not null references public.promotions(id) on delete cascade,
      buy_product_id %s not null references public.products(id) on delete cascade,
      buy_qty numeric(14, 4) not null default 0,
      buy_unit text not null default ''cartons'',
      reward_product_id %s not null references public.products(id) on delete cascade,
      reward_qty numeric(14, 4) not null default 0,
      reward_unit text not null default ''cartons'',
      row_no integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )',
    product_id_type,
    product_id_type
  );
end $$;

create index if not exists idx_promotions_org on public.promotions(organization_id);
create index if not exists idx_promotions_dates on public.promotions(start_date, end_date);
create index if not exists idx_promotion_rules_org on public.promotion_rules(organization_id);
create index if not exists idx_promotion_rules_promo on public.promotion_rules(promotion_id);

alter table public.promotions enable row level security;
alter table public.promotion_rules enable row level security;

drop policy if exists "Users can read own org promotions" on public.promotions;
create policy "Users can read own org promotions" on public.promotions for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org promotions" on public.promotions;
create policy "Users can insert own org promotions" on public.promotions for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org promotions" on public.promotions;
create policy "Users can update own org promotions" on public.promotions for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org promotions" on public.promotions;
create policy "Users can delete own org promotions" on public.promotions for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can read own org promotion_rules" on public.promotion_rules;
create policy "Users can read own org promotion_rules" on public.promotion_rules for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can insert own org promotion_rules" on public.promotion_rules;
create policy "Users can insert own org promotion_rules" on public.promotion_rules for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can update own org promotion_rules" on public.promotion_rules;
create policy "Users can update own org promotion_rules" on public.promotion_rules for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
drop policy if exists "Users can delete own org promotion_rules" on public.promotion_rules;
create policy "Users can delete own org promotion_rules" on public.promotion_rules for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.set_promotions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_promotions_updated_at on public.promotions;
create trigger trg_promotions_updated_at
before update on public.promotions
for each row
execute function public.set_promotions_updated_at();

drop trigger if exists trg_promotion_rules_updated_at on public.promotion_rules;
create trigger trg_promotion_rules_updated_at
before update on public.promotion_rules
for each row
execute function public.set_promotions_updated_at();
