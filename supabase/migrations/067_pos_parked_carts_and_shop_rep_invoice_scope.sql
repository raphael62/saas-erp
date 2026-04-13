-- Shop sales rep: restrict POS/sales invoices by linked rep even when profiles.linked_sales_rep_id
-- was not set (RBAC role "shop sales rep"). Cashiers: shared parked carts per location (see pos_parked_cart_visible).

create or replace function public.sales_invoice_visible_under_transaction_scope(
  p_location_id uuid,
  p_sales_rep_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_linked uuid;
  v_default uuid;
  v_loc_count int;
  v_rep_restricted boolean;
  v_loc_restricted boolean;
  v_is_shop_rep boolean;
  v_prof_role text;
begin
  perform set_config('row_security', 'off', true);

  if public.user_has_full_transaction_access() then
    return true;
  end if;

  select p.linked_sales_rep_id, p.default_location_id,
    lower(regexp_replace(trim(coalesce(p.role, '')), '[\s-]+', '_', 'g'))
  into v_linked, v_default, v_prof_role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  select exists (
    select 1
    from public.profile_roles pr
    inner join public.roles r on r.id = pr.role_id and r.organization_id = pr.organization_id
    where pr.profile_id = auth.uid()
      and pr.organization_id = (select p2.organization_id from public.profiles p2 where p2.id = auth.uid() limit 1)
      and lower(regexp_replace(trim(coalesce(r.name, '')), '[\s-]+', '_', 'g')) in ('shop_sales_rep', 'shopsalesrep')
  ) into v_is_shop_rep;

  v_is_shop_rep := coalesce(v_is_shop_rep, false)
    or coalesce(v_prof_role, '') in ('shop_sales_rep', 'shopsalesrep');

  select count(*)::int into v_loc_count
  from public.profile_user_locations
  where profile_id = auth.uid();

  v_rep_restricted := (v_linked is not null) or coalesce(v_is_shop_rep, false);
  v_loc_restricted := v_default is not null or v_loc_count > 0;

  if v_loc_restricted then
    if p_location_id is null then
      return false;
    end if;
    if not (
      (v_default is not null and p_location_id = v_default)
      or exists (
        select 1 from public.profile_user_locations pur
        where pur.profile_id = auth.uid()
          and pur.location_id = p_location_id
      )
    ) then
      return false;
    end if;
  end if;

  if v_rep_restricted then
    if p_sales_rep_id is null or v_linked is null or p_sales_rep_id <> v_linked then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- Parked POS carts (shared per org; visibility: cashiers see all carts at assigned locations;
-- shop sales reps only carts for their linked sales rep; same location rules as invoices.)

create table if not exists public.pos_parked_carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  sales_rep_id uuid references public.sales_reps(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  parked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_parked_carts_org_location
  on public.pos_parked_carts (organization_id, location_id);

create or replace function public.pos_parked_cart_visible(
  p_location_id uuid,
  p_sales_rep_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_linked uuid;
  v_default uuid;
  v_loc_count int;
  v_rep_restricted boolean;
  v_loc_restricted boolean;
  v_is_shop_rep boolean;
  v_is_cashier boolean;
  v_prof_role text;
begin
  perform set_config('row_security', 'off', true);

  if public.user_has_full_transaction_access() then
    return true;
  end if;

  select p.linked_sales_rep_id, p.default_location_id,
    lower(regexp_replace(trim(coalesce(p.role, '')), '[\s-]+', '_', 'g'))
  into v_linked, v_default, v_prof_role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  select exists (
    select 1
    from public.profile_roles pr
    inner join public.roles r on r.id = pr.role_id and r.organization_id = pr.organization_id
    where pr.profile_id = auth.uid()
      and pr.organization_id = (select p2.organization_id from public.profiles p2 where p2.id = auth.uid() limit 1)
      and lower(regexp_replace(trim(coalesce(r.name, '')), '[\s-]+', '_', 'g')) in ('shop_sales_rep', 'shopsalesrep')
  ) into v_is_shop_rep;

  v_is_shop_rep := coalesce(v_is_shop_rep, false)
    or coalesce(v_prof_role, '') in ('shop_sales_rep', 'shopsalesrep');

  select exists (
    select 1
    from public.profile_roles pr
    inner join public.roles r on r.id = pr.role_id and r.organization_id = pr.organization_id
    where pr.profile_id = auth.uid()
      and pr.organization_id = (select p2.organization_id from public.profiles p2 where p2.id = auth.uid() limit 1)
      and lower(regexp_replace(trim(coalesce(r.name, '')), '[\s-]+', '_', 'g')) in ('cashier', 'pos_cashier', 'shop_cashier')
  ) into v_is_cashier;

  v_is_cashier := coalesce(v_is_cashier, false)
    or coalesce(v_prof_role, '') in ('cashier', 'pos_cashier', 'shop_cashier');

  select count(*)::int into v_loc_count
  from public.profile_user_locations
  where profile_id = auth.uid();

  v_rep_restricted := (v_linked is not null) or coalesce(v_is_shop_rep, false);
  v_loc_restricted := v_default is not null or v_loc_count > 0;

  if v_loc_restricted then
    if p_location_id is null then
      return false;
    end if;
    if not (
      (v_default is not null and p_location_id = v_default)
      or exists (
        select 1 from public.profile_user_locations pur
        where pur.profile_id = auth.uid()
          and pur.location_id = p_location_id
      )
    ) then
      return false;
    end if;
  end if;

  if coalesce(v_is_cashier, false) then
    return true;
  end if;

  if v_rep_restricted then
    if p_sales_rep_id is null or v_linked is null or p_sales_rep_id <> v_linked then
      return false;
    end if;
  end if;

  return true;
end;
$$;

alter table public.pos_parked_carts enable row level security;

drop policy if exists "pos_parked_carts_select" on public.pos_parked_carts;
create policy "pos_parked_carts_select" on public.pos_parked_carts
  for select using (
    organization_id = public.get_my_org_id()
    and public.pos_parked_cart_visible(location_id, sales_rep_id)
  );

drop policy if exists "pos_parked_carts_insert" on public.pos_parked_carts;
create policy "pos_parked_carts_insert" on public.pos_parked_carts
  for insert with check (
    organization_id = public.get_my_org_id()
    and public.pos_parked_cart_visible(location_id, sales_rep_id)
  );

drop policy if exists "pos_parked_carts_update" on public.pos_parked_carts;
create policy "pos_parked_carts_update" on public.pos_parked_carts
  for update using (
    organization_id = public.get_my_org_id()
    and public.pos_parked_cart_visible(location_id, sales_rep_id)
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.pos_parked_cart_visible(location_id, sales_rep_id)
  );

drop policy if exists "pos_parked_carts_delete" on public.pos_parked_carts;
create policy "pos_parked_carts_delete" on public.pos_parked_carts
  for delete using (
    organization_id = public.get_my_org_id()
    and public.pos_parked_cart_visible(location_id, sales_rep_id)
  );

select pg_notify('pgrst', 'reload schema');
