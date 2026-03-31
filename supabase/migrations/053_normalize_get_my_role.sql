-- Normalize profiles.role values so RLS policies recognize "Super Admin" as super_admin, etc.
-- This avoids mismatches between UI strings and policy checks.

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select
    case
      when role is null then null
      else lower(trim(regexp_replace(role, '[\s-]+', '_', 'g')))
    end
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

select pg_notify('pgrst', 'reload schema');

