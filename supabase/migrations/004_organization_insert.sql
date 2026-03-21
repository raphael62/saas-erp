-- Allow users to create an organization (for first-time setup)
create policy "Users can insert organization"
  on public.organizations for insert
  with check (true);
