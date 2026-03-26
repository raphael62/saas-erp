-- Product columns used by inventory, empties, POS, and invoices.
-- Baseline migration 003_products.sql only had core fields; these were added in ADD_PRODUCT_FIELDS.sql
-- but never migrated. Dev databases that only ran migrations are missing them.

alter table public.products add column if not exists code text;
alter table public.products add column if not exists pack_unit integer;
alter table public.products add column if not exists plastic_cost numeric(12, 2) default 0;
alter table public.products add column if not exists bottle_cost numeric(12, 2) default 0;
alter table public.products add column if not exists reorder_qty numeric(12, 2) default 0;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists supplier_id uuid;
alter table public.products add column if not exists empties_type text;
alter table public.products add column if not exists is_active boolean default true;
alter table public.products add column if not exists taxable boolean default true;
alter table public.products add column if not exists returnable boolean default false;
