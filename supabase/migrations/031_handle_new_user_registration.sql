-- When users sign up: registration (org_id in metadata) or invite (org_id in metadata)
-- For registration (first user): set profile.role = super_admin, org.created_by = new user
-- For invite: role stays null (assign via Users UI)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_org_id uuid;
  v_is_first boolean;
begin
  v_org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
  v_is_first := v_org_id is not null
    and exists (select 1 from public.organizations where id = v_org_id and created_by is null);

  insert into public.profiles (id, email, full_name, organization_id, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    v_org_id,
    case when v_is_first then 'super_admin' else null end
  );

  if v_org_id is not null and v_is_first then
    update public.organizations
    set created_by = new.id
    where id = v_org_id and created_by is null;
  end if;

  return new;
end;
$$ language plpgsql security definer;
