-- VSR monthly target: optional customer (route / van account).
-- Load out sheet: optional customer copied from VSR for rep + month.

do $$
declare
  customer_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into customer_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'customers'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if customer_id_type is null then
    raise exception 'public.customers.id not found. Ensure customers table exists first.';
  end if;

  execute format(
    'alter table public.sales_vsr_monthly_targets
      add column if not exists customer_id %s references public.customers(id) on delete set null',
    customer_id_type
  );

  execute format(
    'alter table public.load_out_sheets
      add column if not exists customer_id %s references public.customers(id) on delete set null',
    customer_id_type
  );
end $$;

create index if not exists idx_sales_vsr_monthly_targets_customer on public.sales_vsr_monthly_targets(customer_id);
create index if not exists idx_load_out_sheets_customer on public.load_out_sheets(customer_id);
