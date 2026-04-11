-- Transaction scope: restrict sales_invoices / lines by profile_user_locations,
-- profiles.default_location_id, and profiles.linked_sales_rep_id.
-- Full access: admin roles (get_my_role), org owner, or user with no rep link and no location assignments.

create index if not exists idx_profile_user_locations_profile
  on public.profile_user_locations (profile_id);

create or replace function public.user_has_full_transaction_access()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org uuid;
  v_linked uuid;
  v_default uuid;
  v_loc_count int;
begin
  perform set_config('row_security', 'off', true);

  select p.organization_id, p.linked_sales_rep_id, p.default_location_id
  into v_org, v_linked, v_default
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_org is null then
    return false;
  end if;

  if coalesce(public.get_my_role(), '') in ('platform_admin', 'super_admin', 'admin') then
    return true;
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = v_org and o.created_by = auth.uid()
  ) then
    return true;
  end if;

  if v_linked is null and v_default is null then
    select count(*)::int into v_loc_count
    from public.profile_user_locations
    where profile_id = auth.uid();
    if v_loc_count = 0 then
      return true;
    end if;
  end if;

  return false;
end;
$$;

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
begin
  perform set_config('row_security', 'off', true);

  if public.user_has_full_transaction_access() then
    return true;
  end if;

  select p.linked_sales_rep_id, p.default_location_id
  into v_linked, v_default
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  select count(*)::int into v_loc_count
  from public.profile_user_locations
  where profile_id = auth.uid();

  v_rep_restricted := v_linked is not null;
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
    if p_sales_rep_id is null or p_sales_rep_id <> v_linked then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- sales_invoices
drop policy if exists "Users can read own org sales_invoices" on public.sales_invoices;
create policy "Users can read own org sales_invoices" on public.sales_invoices
  for select using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can insert own org sales_invoices" on public.sales_invoices;
create policy "Users can insert own org sales_invoices" on public.sales_invoices
  for insert with check (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can update own org sales_invoices" on public.sales_invoices;
create policy "Users can update own org sales_invoices" on public.sales_invoices
  for update using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can delete own org sales_invoices" on public.sales_invoices;
create policy "Users can delete own org sales_invoices" on public.sales_invoices
  for delete using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

-- sales_invoice_lines (inherit visibility from parent invoice)
drop policy if exists "Users can read own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can read own org sales_invoice_lines" on public.sales_invoice_lines
  for select using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_invoices si
      where si.id = sales_invoice_id
        and si.organization_id = sales_invoice_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(si.location_id, si.sales_rep_id)
    )
  );

drop policy if exists "Users can insert own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can insert own org sales_invoice_lines" on public.sales_invoice_lines
  for insert with check (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_invoices si
      where si.id = sales_invoice_id
        and si.organization_id = sales_invoice_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(si.location_id, si.sales_rep_id)
    )
  );

drop policy if exists "Users can update own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can update own org sales_invoice_lines" on public.sales_invoice_lines
  for update using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_invoices si
      where si.id = sales_invoice_id
        and si.organization_id = sales_invoice_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(si.location_id, si.sales_rep_id)
    )
  )
  with check (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_invoices si
      where si.id = sales_invoice_id
        and si.organization_id = sales_invoice_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(si.location_id, si.sales_rep_id)
    )
  );

drop policy if exists "Users can delete own org sales_invoice_lines" on public.sales_invoice_lines;
create policy "Users can delete own org sales_invoice_lines" on public.sales_invoice_lines
  for delete using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_invoices si
      where si.id = sales_invoice_id
        and si.organization_id = sales_invoice_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(si.location_id, si.sales_rep_id)
    )
  );

-- Next invoice sequence for a prefix (org-wide, bypasses RLS) so scoped users do not collide.
create or replace function public.next_sales_invoice_seq_for_prefix(
  p_organization_id uuid,
  p_prefix text
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_latest text;
  v_suffix text;
  v_n int;
begin
  if p_organization_id is distinct from public.get_my_org_id() then
    raise exception 'organization mismatch';
  end if;

  select si.invoice_no into v_latest
  from public.sales_invoices si
  where si.organization_id = p_organization_id
    and si.invoice_no ilike p_prefix || '%'
  order by si.invoice_no desc
  limit 1;

  if v_latest is null or length(v_latest) <= length(p_prefix) then
    return 1;
  end if;

  v_suffix := substr(v_latest, length(p_prefix) + 1);
  begin
    v_n := coalesce(nullif(trim(v_suffix), '')::int, 0);
  exception when others then
    v_n := 0;
  end;
  return v_n + 1;
end;
$$;

grant execute on function public.next_sales_invoice_seq_for_prefix(uuid, text) to authenticated;

-- sales_orders / lines (same location + rep rules as invoices)
drop policy if exists "Users can read own org sales_orders" on public.sales_orders;
create policy "Users can read own org sales_orders" on public.sales_orders
  for select using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can insert own org sales_orders" on public.sales_orders;
create policy "Users can insert own org sales_orders" on public.sales_orders
  for insert with check (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can update own org sales_orders" on public.sales_orders;
create policy "Users can update own org sales_orders" on public.sales_orders
  for update using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  )
  with check (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can delete own org sales_orders" on public.sales_orders;
create policy "Users can delete own org sales_orders" on public.sales_orders
  for delete using (
    organization_id = public.get_my_org_id()
    and public.sales_invoice_visible_under_transaction_scope(location_id, sales_rep_id)
  );

drop policy if exists "Users can read own org sales_order_lines" on public.sales_order_lines;
create policy "Users can read own org sales_order_lines" on public.sales_order_lines
  for select using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_orders so
      where so.id = sales_order_id
        and so.organization_id = sales_order_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(so.location_id, so.sales_rep_id)
    )
  );

drop policy if exists "Users can insert own org sales_order_lines" on public.sales_order_lines;
create policy "Users can insert own org sales_order_lines" on public.sales_order_lines
  for insert with check (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_orders so
      where so.id = sales_order_id
        and so.organization_id = sales_order_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(so.location_id, so.sales_rep_id)
    )
  );

drop policy if exists "Users can update own org sales_order_lines" on public.sales_order_lines;
create policy "Users can update own org sales_order_lines" on public.sales_order_lines
  for update using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_orders so
      where so.id = sales_order_id
        and so.organization_id = sales_order_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(so.location_id, so.sales_rep_id)
    )
  )
  with check (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_orders so
      where so.id = sales_order_id
        and so.organization_id = sales_order_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(so.location_id, so.sales_rep_id)
    )
  );

drop policy if exists "Users can delete own org sales_order_lines" on public.sales_order_lines;
create policy "Users can delete own org sales_order_lines" on public.sales_order_lines
  for delete using (
    organization_id = public.get_my_org_id()
    and exists (
      select 1
      from public.sales_orders so
      where so.id = sales_order_id
        and so.organization_id = sales_order_lines.organization_id
        and public.sales_invoice_visible_under_transaction_scope(so.location_id, so.sales_rep_id)
    )
  );

select pg_notify('pgrst', 'reload schema');
