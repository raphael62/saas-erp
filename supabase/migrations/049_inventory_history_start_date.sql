-- Per-organization go-live anchor for inventory change history ledger calculations.
alter table public.organizations
  add column if not exists inventory_history_start_date date;

select pg_notify('pgrst', 'reload schema');
