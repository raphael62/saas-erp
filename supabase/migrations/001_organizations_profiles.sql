-- Organizations (tenants)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User profiles linked to auth and organization
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email text,
  full_name text,
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

-- Users can read their own organization
create policy "Users can read own organization"
  on public.organizations for select
  using (
    id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

-- Users can read/update their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Service role can manage all (for server-side admin)
-- Application uses anon key + RLS; service role used only for migrations/admin

-- Trigger: create profile on signup (run as postgres or via Supabase dashboard)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Create profile automatically when a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
