-- Function to trigger PostgREST schema cache reload.
-- Call via RPC when new tables are added and PostgREST hasn't picked them up.
create or replace function public.reload_postgrest_schema()
returns void
language sql
security definer
set search_path = public
as $$
  select pg_notify('pgrst', 'reload schema');
$$;

comment on function public.reload_postgrest_schema() is 'Notifies PostgREST to reload its schema cache. Use after running migrations.';

-- Only service role can execute (for API route).
revoke all on function public.reload_postgrest_schema() from public;
grant execute on function public.reload_postgrest_schema() to service_role;
