-- Add payment_account_id to sales_invoices for Daily Payments by account
alter table public.sales_invoices
  add column if not exists payment_account_id uuid
  references public.payment_accounts(id) on delete set null;
