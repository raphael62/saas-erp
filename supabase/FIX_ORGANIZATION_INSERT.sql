-- Run this in Supabase SQL Editor
-- Fixes: organizations table stays empty because INSERT policy was missing

-- 1. Add policy so authenticated users can create an organization
drop policy if exists "Users can insert organization" on public.organizations;
create policy "Users can insert organization"
  on public.organizations for insert
  with check (true);

-- 2. (Optional) Create orgs for existing users who have a profile but no org
-- Run this block if you have users who signed up before and never got an org
do $$
declare
  rec record;
  new_slug text;
  new_org_id uuid;
begin
  for rec in
    select p.id as profile_id, p.email, p.full_name,
           u.raw_user_meta_data->>'organization_name' as org_name
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.organization_id is null
  loop
    new_slug := coalesce(
      lower(regexp_replace(coalesce(rec.org_name, rec.full_name, rec.email, 'My Organization'), '\s+', '-', 'g')),
      'org'
    );
    new_slug := regexp_replace(new_slug, '[^a-z0-9-]', '', 'g');
    if new_slug = '' then new_slug := 'org'; end if;
    new_slug := new_slug || '-' || substr(rec.profile_id::text, 1, 8);

    insert into public.organizations (name, slug)
    values (
      coalesce(rec.org_name, rec.full_name, split_part(rec.email, '@', 1), 'My Organization'),
      new_slug
    )
    returning id into new_org_id;

    update public.profiles set organization_id = new_org_id where id = rec.profile_id;
  end loop;
end $$;
