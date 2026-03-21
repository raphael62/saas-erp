-- Add additional sales_reps fields used by New Business Executive form
-- Run after ADD_SALES_REPS_AND_CUSTOMER_FIELDS.sql

alter table public.sales_reps add column if not exists first_name text;
alter table public.sales_reps add column if not exists last_name text;
alter table public.sales_reps add column if not exists sales_rep_type text;
alter table public.sales_reps add column if not exists company text;
alter table public.sales_reps add column if not exists email text;
alter table public.sales_reps add column if not exists location text;

