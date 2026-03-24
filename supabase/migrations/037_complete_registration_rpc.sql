-- Link the signed-in user to the org created during registration.
-- Called from the browser right after signUp + start_registration (same JWT as the client).
-- Fixes production where server actions often see no session cookies yet.
create or replace function public.complete_registration(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'Invalid organization';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  update public.profiles
  set organization_id = p_org_id, role = 'super_admin'
  where id = auth.uid();

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    insert into public.profiles (id, email, full_name, organization_id, role)
    values (
      auth.uid(),
      v_email,
      coalesce(
        (select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid()),
        ''
      ),
      p_org_id,
      'super_admin'
    );
  end if;

  update public.organizations
  set created_by = auth.uid()
  where id = p_org_id and created_by is null;
end;
$$;

comment on function public.complete_registration(uuid) is 'Finishes self-serve registration: sets profile.organization_id and org.created_by for auth.uid().';

revoke all on function public.complete_registration(uuid) from public;
grant execute on function public.complete_registration(uuid) to authenticated;
