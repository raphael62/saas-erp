-- Allow org owners (created_by) to update their organization
-- Allow org members to update when created_by is null (backfill for existing orgs)
drop policy if exists "Org owners can update organization" on public.organizations;
create policy "Org owners can update organization" on public.organizations for update
  using (
    created_by = auth.uid()
    or (
      created_by is null
      and id in (select organization_id from public.profiles where id = auth.uid())
    )
  )
  with check (
    created_by = auth.uid()
    or (
      created_by is null
      and id in (select organization_id from public.profiles where id = auth.uid())
    )
  );
