-- Add unit_price to VSR target lines for price-by-customer-type lookup persistence.

alter table public.sales_vsr_monthly_target_lines
  add column if not exists unit_price numeric(14, 4) not null default 0;
