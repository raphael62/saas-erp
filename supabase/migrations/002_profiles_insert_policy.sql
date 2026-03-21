-- Allow users to insert their own profile (for backfilling existing users who signed up before the trigger existed)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());
