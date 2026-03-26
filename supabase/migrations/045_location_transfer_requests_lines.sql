-- Upgrade location transfers to request + line-items model.

alter table public.location_transfers
  add column if not exists request_date date;

update public.location_transfers
set request_date = coalesce(request_date, transfer_date);

alter table public.location_transfers
  alter column request_date set default current_date;

alter table public.location_transfers
  alter column request_date set not null;

alter table public.location_transfers
  add column if not exists status text not null default 'requested';

-- Header now represents a request envelope; line-level products/qty are stored in location_transfer_lines.
alter table public.location_transfers
  alter column product_id drop not null;

alter table public.location_transfers
  alter column qty drop not null;

-- Create lines table using correct products.id type (uuid vs integer)
do $$
declare
  product_id_type text;
  current_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into product_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if product_id_type is null then
    raise exception 'public.products.id not found. Ensure products table exists first.';
  end if;

  if to_regclass('public.location_transfer_lines') is null then
    execute format(
      'create table public.location_transfer_lines (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        location_transfer_id uuid not null references public.location_transfers(id) on delete cascade,
        product_id %s not null,
        cartons numeric(14, 2) not null default 0,
        bottles numeric(14, 2) not null default 0,
        ctn_qty numeric(14, 4) not null default 0,
        notes text,
        row_no integer not null default 0,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )',
      product_id_type
    );
  else
    -- If table already exists but product_id type mismatches, drop/re-add column.
    select format_type(a.atttypid, a.atttypmod)
      into current_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'location_transfer_lines'
      and a.attname = 'product_id'
      and a.attnum > 0
      and not a.attisdropped;

    if current_type is not null and current_type <> product_id_type then
      execute 'alter table public.location_transfer_lines drop constraint if exists location_transfer_lines_product_id_fkey';
      execute 'alter table public.location_transfer_lines drop column if exists product_id';
      execute format('alter table public.location_transfer_lines add column product_id %s not null', product_id_type);
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.location_transfer_lines'::regclass
      and conname = 'location_transfer_lines_product_id_fkey'
  ) then
    execute 'alter table public.location_transfer_lines add constraint location_transfer_lines_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict';
  end if;
end $$;

create index if not exists idx_location_transfer_lines_org on public.location_transfer_lines(organization_id);
create index if not exists idx_location_transfer_lines_transfer on public.location_transfer_lines(location_transfer_id);
create index if not exists idx_location_transfer_lines_product on public.location_transfer_lines(product_id);

alter table public.location_transfer_lines enable row level security;

drop policy if exists "Users can read own org location_transfer_lines" on public.location_transfer_lines;
create policy "Users can read own org location_transfer_lines" on public.location_transfer_lines for select
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can insert own org location_transfer_lines" on public.location_transfer_lines;
create policy "Users can insert own org location_transfer_lines" on public.location_transfer_lines for insert
  with check (organization_id = public.get_my_org_id());

drop policy if exists "Users can update own org location_transfer_lines" on public.location_transfer_lines;
create policy "Users can update own org location_transfer_lines" on public.location_transfer_lines for update
  using (organization_id = public.get_my_org_id());

drop policy if exists "Users can delete own org location_transfer_lines" on public.location_transfer_lines;
create policy "Users can delete own org location_transfer_lines" on public.location_transfer_lines for delete
  using (organization_id = public.get_my_org_id());

create or replace function public.set_location_transfer_lines_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_location_transfer_lines_updated_at on public.location_transfer_lines;
create trigger trg_location_transfer_lines_updated_at
before update on public.location_transfer_lines
for each row execute function public.set_location_transfer_lines_updated_at();
