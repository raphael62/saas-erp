-- POS extensions for sales_invoices
-- Reuse sales_invoices with type_status='pos'
-- Add: empties_value, payment_method, cashier_id for POS workflow

alter table public.sales_invoices add column if not exists empties_value numeric(14, 2) not null default 0;
alter table public.sales_invoices add column if not exists payment_method text;
alter table public.sales_invoices add column if not exists cashier_id uuid references auth.users(id) on delete set null;
alter table public.sales_invoice_lines add column if not exists is_promo boolean not null default false;

create index if not exists idx_sales_invoices_type_status on public.sales_invoices(organization_id, type_status);
create index if not exists idx_sales_invoices_invoice_date_type on public.sales_invoices(invoice_date, type_status);
