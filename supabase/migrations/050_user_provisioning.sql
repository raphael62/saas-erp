-- Admin-provisioned users: profile fields and junction tables (locations, payment accounts).

alter table public.profiles
  add column if not exists user_code text,
  add column if not exists phone text,
  add column if not exists default_location_id uuid references public.locations(id) on delete set null,
  add column if not exists linked_sales_rep_id uuid references public.sales_reps(id) on delete set null;

create unique index if not exists idx_profiles_org_user_code_unique
  on public.profiles (organization_id, lower(trim(user_code)))
  where user_code is not null and trim(user_code) <> '';

create table if not exists public.profile_user_locations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (profile_id, location_id)
);

create index if not exists idx_profile_user_locations_org on public.profile_user_locations(organization_id);

create table if not exists public.profile_payment_accounts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (profile_id, payment_account_id)
);

create index if not exists idx_profile_payment_accounts_org on public.profile_payment_accounts(organization_id);

alter table public.profile_user_locations enable row level security;
alter table public.profile_payment_accounts enable row level security;

drop policy if exists "Users read own profile_user_locations" on public.profile_user_locations;
create policy "Users read own profile_user_locations" on public.profile_user_locations
  for select using (profile_id = auth.uid());

drop policy if exists "Users read own profile_payment_accounts" on public.profile_payment_accounts;
create policy "Users read own profile_payment_accounts" on public.profile_payment_accounts
  for select using (profile_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
