-- Admins and org owners can read all profiles in their organization
-- Admins and org owners can update role_id on org profiles (for user role assignment)

drop policy if exists "Admins can read org profiles" on public.profiles;
create policy "Admins can read org profiles" on public.profiles for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  );

drop policy if exists "Admins can update org profiles role" on public.profiles;
create policy "Admins can update org profiles role" on public.profiles for update
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  )
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );
