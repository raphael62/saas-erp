alter table public.sales_invoice_lines add column if not exists refunded_qty numeric(14, 2) not null default 0;
alter table public.sales_invoice_lines add column if not exists refunded_cl_qty numeric(14, 2) not null default 0;
