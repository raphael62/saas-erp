-- Harden fix for "infinite recursion detected in policy for relation profiles".
-- Some Postgres/Supabase builds still apply RLS inside SQL SECURITY DEFINER functions
-- even with SET row_security = off. PL/pgSQL + set_config forces RLS off for the read.
-- Also replaces remaining policies that subquery profiles (sales_reps, customers, customer_payments).

create or replace function public.get_my_org_id()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org uuid;
begin
  perform set_config('row_security', 'off', true);
  select organization_id into v_org
  from public.profiles
  where id = auth.uid()
  limit 1;
  return v_org;
end;
$$;

create or replace function public.get_my_role()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  perform set_config('row_security', 'off', true);
  select role into v_role
  from public.profiles
  where id = auth.uid()
  limit 1;
  return v_role;
end;
$$;

-- Refresh org-scoped policies (idempotent; same as 038)
drop policy if exists "Users can read own organization" on public.organizations;
create policy "Users can read own organization"
  on public.organizations for select
  using (id = public.get_my_org_id());

drop policy if exists "Org owners can update organization" on public.organizations;
create policy "Org owners can update organization" on public.organizations for update
  using (
    created_by = auth.uid()
    or (
      created_by is null
      and id = public.get_my_org_id()
    )
  )
  with check (
    created_by = auth.uid()
    or (
      created_by is null
      and id = public.get_my_org_id()
    )
  );

drop policy if exists "Users can read own org locations" on public.locations;
create policy "Users can read own org locations"
  on public.locations for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org locations" on public.locations;
create policy "Users can insert own org locations"
  on public.locations for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org locations" on public.locations;
create policy "Users can update own org locations"
  on public.locations for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org locations" on public.locations;
create policy "Users can delete own org locations"
  on public.locations for delete
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can read own org roles" on public.roles;
create policy "Users can read own org roles" on public.roles for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Admins can manage own org roles" on public.roles;
create policy "Admins can manage own org roles" on public.roles for all
  using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin', 'platform_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  )
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can read own org role_permissions" on public.role_permissions;
create policy "Users can read own org role_permissions" on public.role_permissions for select
  using (
    role_id in (
      select r.id from public.roles r where r.organization_id = public.get_my_org_id()
    )
  );

drop policy if exists "Admins can manage own org role_permissions" on public.role_permissions;
create policy "Admins can manage own org role_permissions" on public.role_permissions for all
  using (
    role_id in (
      select r.id
      from public.roles r
      where r.organization_id = public.get_my_org_id()
        and (
          public.get_my_role() in ('admin', 'super_admin', 'platform_admin')
          or (select created_by from public.organizations where id = r.organization_id) = auth.uid()
        )
    )
  );

drop policy if exists "Admins can read org profiles" on public.profiles;
create policy "Admins can read org profiles" on public.profiles for select
  using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin', 'platform_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  );

drop policy if exists "Admins can update org profiles role" on public.profiles;
create policy "Admins can update org profiles role" on public.profiles for update
  using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin', 'platform_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  )
  with check (organization_id = public.get_my_org_id());

-- sales_reps / customers / customer_payments (034 / 033): remove profiles subqueries
drop policy if exists "Users can read own org sales_reps" on public.sales_reps;
create policy "Users can read own org sales_reps" on public.sales_reps for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org sales_reps" on public.sales_reps;
create policy "Users can insert own org sales_reps" on public.sales_reps for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org sales_reps" on public.sales_reps;
create policy "Users can update own org sales_reps" on public.sales_reps for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org sales_reps" on public.sales_reps;
create policy "Users can delete own org sales_reps" on public.sales_reps for delete
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can read own org customers" on public.customers;
create policy "Users can read own org customers" on public.customers for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org customers" on public.customers;
create policy "Users can insert own org customers" on public.customers for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org customers" on public.customers;
create policy "Users can update own org customers" on public.customers for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org customers" on public.customers;
create policy "Users can delete own org customers" on public.customers for delete
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can read own org customer_payments" on public.customer_payments;
create policy "Users can read own org customer_payments" on public.customer_payments for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org customer_payments" on public.customer_payments;
create policy "Users can insert own org customer_payments" on public.customer_payments for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org customer_payments" on public.customer_payments;
create policy "Users can update own org customer_payments" on public.customer_payments for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org customer_payments" on public.customer_payments;
create policy "Users can delete own org customer_payments" on public.customer_payments for delete
  using (organization_id = public.get_my_org_id());

-- Master data lookups (ADD_MASTER_DATA_LOOKUPS.sql): p_read_* / p_insert_* etc. used profiles subqueries
do $$
declare
  t text;
begin
  foreach t in array array[
    'brand_categories',
    'empties_types',
    'price_types',
    'units_of_measure',
    'payment_methods',
    'location_types',
    'customer_groups',
    'customer_types'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;
    execute format('drop policy if exists "p_read_%s" on public.%I', t, t);
    execute format(
      'create policy "p_read_%s" on public.%I for select using (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_insert_%s" on public.%I', t, t);
    execute format(
      'create policy "p_insert_%s" on public.%I for insert with check (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_update_%s" on public.%I', t, t);
    execute format(
      'create policy "p_update_%s" on public.%I for update using (organization_id = public.get_my_org_id())',
      t, t
    );
    execute format('drop policy if exists "p_delete_%s" on public.%I', t, t);
    execute format(
      'create policy "p_delete_%s" on public.%I for delete using (organization_id = public.get_my_org_id())',
      t, t
    );
  end loop;
end $$;

grant execute on function public.get_my_org_id() to authenticated;
grant execute on function public.get_my_role() to authenticated;
