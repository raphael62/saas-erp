-- Add platform_admin to RLS policies (global developer access)

-- Profiles: Admins can read/update org profiles
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
  with check (
    organization_id = public.get_my_org_id()
  );

-- Roles: Admins can manage
drop policy if exists "Admins can manage own org roles" on public.roles;
create policy "Admins can manage own org roles" on public.roles for all
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin', 'platform_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  )
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- Role permissions
drop policy if exists "Admins can manage own org role_permissions" on public.role_permissions;
create policy "Admins can manage own org role_permissions" on public.role_permissions for all
  using (
    role_id in (
      select id from public.roles r
      where r.organization_id in (select organization_id from public.profiles where id = auth.uid())
      and (
        (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin', 'platform_admin')
        or (select created_by from public.organizations where id = r.organization_id) = auth.uid()
      )
    )
  );
