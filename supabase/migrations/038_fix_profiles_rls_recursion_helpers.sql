-- Fix "infinite recursion detected in policy for relation profiles".
-- SECURITY DEFINER helpers must read profiles with row_security disabled, otherwise
-- evaluating any policy that subqueries profiles re-enters profiles RLS (e.g. locations).

create or replace function public.get_my_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- Organizations: use helper (avoids profiles subquery in policy)
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

-- Locations: use helper instead of subquery into profiles
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

-- Roles / role_permissions: use helpers (matches 032 intent, no profiles subquery)
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

-- Profiles admin policies (same logic as 032; helpers now bypass RLS when reading self row)
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
