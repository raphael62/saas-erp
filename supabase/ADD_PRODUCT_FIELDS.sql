-- Add product fields to match New Product form
-- Run after ADD_PRODUCTS_AND_ORG.sql

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

-- Ensure unique code per org (optional, run only if you want code to be unique)
-- create unique index if not exists idx_products_org_code on public.products(organization_id, code) where code is not null;
