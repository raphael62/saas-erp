-- Add 6-digit company code to organizations
alter table public.organizations
  add column if not exists code char(6) unique;

-- Backfill existing orgs with unique codes (100000 + row_number)
with numbered as (
  select id, lpad((100000 + row_number() over (order by created_at))::text, 6, '0') as c
  from public.organizations
  where code is null
)
update public.organizations o
set code = n.c
from numbered n
where o.id = n.id;

alter table public.organizations
  alter column code set not null;

-- RPC: Start registration (unauthenticated). Creates org with generated code.
create or replace function public.start_registration(p_company_name text, p_phone text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_org_id uuid;
  v_attempt int := 0;
begin
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Company name is required';
  end if;

  loop
    v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');
    begin
      insert into public.organizations (name, phone, code, created_by)
      values (trim(p_company_name), nullif(trim(p_phone), ''), v_code, null)
      returning id into v_org_id;
      return json_build_object('org_id', v_org_id, 'code', v_code);
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 10 then
        raise exception 'Could not generate unique code';
      end if;
    end;
  end loop;
end;
$$;

grant execute on function public.start_registration(text, text) to anon;
grant execute on function public.start_registration(text, text) to authenticated;

-- Create default Admin and Member roles for new organizations
create or replace function public.create_default_roles_for_org()
returns trigger as $$
declare
  v_admin_id uuid;
  v_module text;
begin
  insert into public.roles (organization_id, name, is_active)
  values (new.id, 'Admin', true)
  returning id into v_admin_id;

  insert into public.roles (organization_id, name, is_active)
  values (new.id, 'Member', true);

  for v_module in select unnest(array['dashboard','purchases','sales','pos','inventory','production','accounting','hr','reports','settings'])
  loop
    insert into public.role_permissions (role_id, module_key, page_key, is_full)
    values (v_admin_id, v_module, null, true);
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_organization_created_default_roles on public.organizations;
create trigger on_organization_created_default_roles
  after insert on public.organizations
  for each row execute procedure public.create_default_roles_for_org();
