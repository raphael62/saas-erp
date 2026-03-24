-- Roles & Permissions (custom roles per org, permission matrix)

-- Add created_by to organizations for org owner concept
alter table public.organizations
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Roles (custom per organization)
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists roles_org_name_unique on public.roles (organization_id, lower(name));
create index if not exists idx_roles_organization on public.roles(organization_id);

-- Role permissions (matrix: module + page + actions)
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  module_key text not null,
  page_key text,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  is_full boolean not null default false
);

create unique index if not exists role_permissions_role_module_page_unique
  on public.role_permissions (role_id, module_key, coalesce(page_key, ''));
create index if not exists idx_role_permissions_role on public.role_permissions(role_id);

-- Add role_id to profiles
alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete set null;

-- RLS for roles
alter table public.roles enable row level security;

drop policy if exists "Users can read own org roles" on public.roles;
create policy "Users can read own org roles" on public.roles for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "Admins can manage own org roles" on public.roles;
create policy "Admins can manage own org roles" on public.roles for all
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

-- RLS for role_permissions
alter table public.role_permissions enable row level security;

drop policy if exists "Users can read own org role_permissions" on public.role_permissions;
create policy "Users can read own org role_permissions" on public.role_permissions for select
  using (
    role_id in (
      select id from public.roles
      where organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists "Admins can manage own org role_permissions" on public.role_permissions;
create policy "Admins can manage own org role_permissions" on public.role_permissions for all
  using (
    role_id in (
      select id from public.roles r
      where r.organization_id in (select organization_id from public.profiles where id = auth.uid())
      and (
        (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
        or         (select created_by from public.organizations where id = r.organization_id) = auth.uid()
      )
    )
  );

-- Create default Admin and Member roles for existing organizations
insert into public.roles (organization_id, name, is_active)
select id, 'Admin', true from public.organizations
on conflict (organization_id, lower(name)) do nothing;

insert into public.roles (organization_id, name, is_active)
select id, 'Member', true from public.organizations
on conflict (organization_id, lower(name)) do nothing;

-- Grant Admin role full access to all modules
insert into public.role_permissions (role_id, module_key, page_key, is_full)
select r.id, n.module_key, null, true
from public.roles r
cross join (values ('dashboard'), ('purchases'), ('sales'), ('pos'), ('inventory'), ('production'), ('accounting'), ('hr'), ('reports'), ('settings')) as n(module_key)
where r.name = 'Admin'
on conflict (role_id, module_key, coalesce(page_key, '')) do update set is_full = true;

-- Backfill: set role_id for users with role = 'admin' to their org's Admin role
update public.profiles p
set role_id = (select id from public.roles r where r.organization_id = p.organization_id and r.name = 'Admin' limit 1)
where p.role in ('admin', 'super_admin') and p.organization_id is not null and p.role_id is null;
