-- Handle case where org was created but profile was not assigned.
-- 1. create_organization_for_user: on duplicate slug, assign existing org to user
-- 2. assign_orphan_org_to_user: repair flow - assign org created by user to their profile

create or replace function public.create_organization_for_user(p_name text, p_slug text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_user_id uuid := auth.uid();
  v_slug text := coalesce(nullif(trim(p_slug), ''), 'org');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Organization name is required';
  end if;

  begin
    insert into public.organizations (name, slug, phone, created_by)
    values (trim(p_name), v_slug, nullif(trim(p_phone), ''), v_user_id)
    returning id into v_org_id;
  exception when unique_violation then
    -- Org already exists (from failed previous run or old flow) - assign it to user
    select id into v_org_id from public.organizations
    where slug = v_slug and (created_by = v_user_id or created_by is null)
    limit 1;
    if v_org_id is null then
      raise exception 'An organization with this name already exists';
    end if;
    update public.organizations set created_by = v_user_id where id = v_org_id and created_by is null;
  end;

  update public.profiles set organization_id = v_org_id where id = v_user_id;
  return v_org_id;
end;
$$;

-- Repair: assign any org created by current user to their profile (for orphaned orgs)
create or replace function public.assign_orphan_org_to_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_org_id from public.organizations
  where created_by = v_user_id
  order by created_at desc
  limit 1;

  if v_org_id is null then
    -- Fallback: org created without created_by (old layout), unassigned to any profile
    select o.id into v_org_id from public.organizations o
    where o.created_by is null
      and not exists (select 1 from public.profiles p where p.organization_id = o.id)
    order by o.created_at desc
    limit 1;
  end if;

  if v_org_id is null then
    return null;
  end if;

  update public.organizations set created_by = v_user_id where id = v_org_id and created_by is null;

  update public.profiles set organization_id = v_org_id where id = v_user_id;
  return v_org_id;
end;
$$;

grant execute on function public.assign_orphan_org_to_user() to authenticated;
