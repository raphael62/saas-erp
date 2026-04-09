-- Production DBs that ran FIX_PRODUCTS_TABLE.sql dropped cost_price; the app still selects it
-- (Stock by Location inventory value, product forms). Restore the column idempotently.

alter table public.products add column if not exists cost_price numeric(12, 2) default 0;

comment on column public.products.cost_price is 'Unit cost for inventory valuation (Stock by Location sidebar, etc.).';
