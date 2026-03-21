-- Product list templates (Inventory > Products)
-- Stores per-organization table templates and column settings.

create table if not exists public.list_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null,
  name text not null,
  authorization_user_id uuid references auth.users(id) on delete set null,
  authorization_group text,
  is_default boolean default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, module_key, name)
);

create index if not exists idx_list_templates_org_module
  on public.list_templates(organization_id, module_key);

create table if not exists public.list_template_columns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.list_templates(id) on delete cascade,
  column_key text not null,
  visible boolean default true,
  width integer,
  sort_order integer,
  sort_direction text check (sort_direction in ('asc', 'desc') or sort_direction is null),
  display_order integer not null default 0,
  unique(template_id, column_key)
);

create index if not exists idx_list_template_columns_template
  on public.list_template_columns(template_id);

alter table public.list_templates enable row level security;
alter table public.list_template_columns enable row level security;

drop policy if exists "lt_read_org" on public.list_templates;
create policy "lt_read_org"
  on public.list_templates
  for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "lt_insert_org" on public.list_templates;
create policy "lt_insert_org"
  on public.list_templates
  for insert
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "lt_update_org" on public.list_templates;
create policy "lt_update_org"
  on public.list_templates
  for update
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "lt_delete_org" on public.list_templates;
create policy "lt_delete_org"
  on public.list_templates
  for delete
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists "ltc_read_org" on public.list_template_columns;
create policy "ltc_read_org"
  on public.list_template_columns
  for select
  using (
    template_id in (
      select id from public.list_templates
      where organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists "ltc_insert_org" on public.list_template_columns;
create policy "ltc_insert_org"
  on public.list_template_columns
  for insert
  with check (
    template_id in (
      select id from public.list_templates
      where organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists "ltc_update_org" on public.list_template_columns;
create policy "ltc_update_org"
  on public.list_template_columns
  for update
  using (
    template_id in (
      select id from public.list_templates
      where organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists "ltc_delete_org" on public.list_template_columns;
create policy "ltc_delete_org"
  on public.list_template_columns
  for delete
  using (
    template_id in (
      select id from public.list_templates
      where organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

