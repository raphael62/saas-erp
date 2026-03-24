-- Fix infinite recursion: policies on profiles cannot reference profiles.
-- 1. Use SECURITY DEFINER helper functions for admin policies.
-- 2. Use SECURITY DEFINER for org creation so profile update bypasses RLS.

create or replace function public.get_my_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- Create organization and assign to current user (bypasses RLS for profile update)
create or replace function public.create_organization_for_user(p_name text, p_slug text, p_phone text default null)
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
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Organization name is required';
  end if;
  insert into public.organizations (name, slug, phone, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_slug), ''), 'org'), nullif(trim(p_phone), ''), v_user_id)
  returning id into v_org_id;
  update public.profiles set organization_id = v_org_id where id = v_user_id;
  return v_org_id;
end;
$$;

grant execute on function public.create_organization_for_user(text, text, text) to authenticated;

-- Replace recursive policies with function-based versions
drop policy if exists "Admins can read org profiles" on public.profiles;
create policy "Admins can read org profiles" on public.profiles for select
  using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  );

drop policy if exists "Admins can update org profiles role" on public.profiles;
create policy "Admins can update org profiles role" on public.profiles for update
  using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  )
  with check (
    organization_id = public.get_my_org_id()
  );
