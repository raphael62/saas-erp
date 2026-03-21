-- ============================================================
-- Add organization_id to all tenant-scoped tables
-- Run this in Supabase SQL Editor
-- Uses exception handling: skips tables that don't exist (no errors)
-- ============================================================

DO $$
BEGIN
  ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_products_organization ON public.products(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_customers_organization ON public.customers(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_suppliers_organization ON public.suppliers(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_organization ON public.purchase_orders(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_sales_orders_organization ON public.sales_orders(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_pos_transactions_organization ON public.pos_transactions(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.production_lines
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.production_recipes
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.production_schedules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.batch_materials
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.quality_checks
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
