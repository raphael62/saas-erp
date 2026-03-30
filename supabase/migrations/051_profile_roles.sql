-- Many-to-many: profiles can have multiple organization roles (e.g. manager + sales rep + cashier).
-- profiles.role_id remains a denormalized "primary" (first in UI order / first assigned) for backward compatibility.

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (profile_id, role_id)
);

create index if not exists idx_profile_roles_org on public.profile_roles(organization_id);
create index if not exists idx_profile_roles_role on public.profile_roles(role_id);

insert into public.profile_roles (profile_id, role_id, organization_id)
select p.id, p.role_id, p.organization_id
from public.profiles p
where p.role_id is not null
  and p.organization_id is not null
on conflict (profile_id, role_id) do nothing;

alter table public.profile_roles enable row level security;

drop policy if exists "Users read own profile_roles" on public.profile_roles;
create policy "Users read own profile_roles" on public.profile_roles
  for select using (profile_id = auth.uid());

drop policy if exists "Admins read org profile_roles" on public.profile_roles;
create policy "Admins read org profile_roles" on public.profile_roles
  for select using (
    organization_id = public.get_my_org_id()
    and (
      public.get_my_role() in ('admin', 'super_admin', 'platform_admin')
      or (select created_by from public.organizations where id = organization_id) = auth.uid()
    )
  );

select pg_notify('pgrst', 'reload schema');
