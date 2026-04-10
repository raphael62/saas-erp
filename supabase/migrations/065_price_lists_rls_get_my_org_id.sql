-- Price lists: create tables if missing (ADD_PRICE_LISTS.sql was not always applied), then RLS with get_my_org_id().
-- product_id matches public.products.id (uuid or integer legacy).

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  price_type_id uuid not null references public.price_types(id) on delete restrict,
  effective_date date not null,
  expiry_date date,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
    $ddl$
    create table if not exists public.price_list_items (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      price_list_id uuid not null references public.price_lists(id) on delete cascade,
      product_id %s not null references public.products(id) on delete cascade,
      price numeric(12, 2) not null default 0,
      tax_rate numeric(5, 2) not null default 20,
      vat_type text not null default 'inc',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (organization_id, price_list_id, product_id)
    )
    $ddl$,
    product_id_type
  );
end $$;

create index if not exists idx_price_lists_org on public.price_lists(organization_id);
create index if not exists idx_price_list_items_org on public.price_list_items(organization_id);
create index if not exists idx_price_list_items_price_list on public.price_list_items(price_list_id);

alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;

drop policy if exists "Users can read own org price_lists" on public.price_lists;
drop policy if exists "Users can insert own org price_lists" on public.price_lists;
drop policy if exists "Users can update own org price_lists" on public.price_lists;
drop policy if exists "Users can delete own org price_lists" on public.price_lists;
drop policy if exists "p_read_price_lists" on public.price_lists;
drop policy if exists "p_insert_price_lists" on public.price_lists;
drop policy if exists "p_update_price_lists" on public.price_lists;
drop policy if exists "p_delete_price_lists" on public.price_lists;

create policy "p_read_price_lists" on public.price_lists
  for select using (organization_id = public.get_my_org_id());

create policy "p_insert_price_lists" on public.price_lists
  for insert with check (organization_id = public.get_my_org_id());

create policy "p_update_price_lists" on public.price_lists
  for update using (organization_id = public.get_my_org_id());

create policy "p_delete_price_lists" on public.price_lists
  for delete using (organization_id = public.get_my_org_id());

drop policy if exists "Users can read own org price_list_items" on public.price_list_items;
drop policy if exists "Users can insert own org price_list_items" on public.price_list_items;
drop policy if exists "Users can update own org price_list_items" on public.price_list_items;
drop policy if exists "Users can delete own org price_list_items" on public.price_list_items;
drop policy if exists "p_read_price_list_items" on public.price_list_items;
drop policy if exists "p_insert_price_list_items" on public.price_list_items;
drop policy if exists "p_update_price_list_items" on public.price_list_items;
drop policy if exists "p_delete_price_list_items" on public.price_list_items;

create policy "p_read_price_list_items" on public.price_list_items
  for select using (organization_id = public.get_my_org_id());

create policy "p_insert_price_list_items" on public.price_list_items
  for insert with check (organization_id = public.get_my_org_id());

create policy "p_update_price_list_items" on public.price_list_items
  for update using (organization_id = public.get_my_org_id());

create policy "p_delete_price_list_items" on public.price_list_items
  for delete using (organization_id = public.get_my_org_id());

select pg_notify('pgrst', 'reload schema');
