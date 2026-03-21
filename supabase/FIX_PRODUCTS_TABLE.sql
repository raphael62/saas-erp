-- ============================================================
-- Fix products table to match the app (no selling prices on products)
-- Safe to run multiple times (idempotent).
--
-- Keeps empties valuation fields on products:
--   - bottle_cost
--   - plastic_cost
--
-- Removes (or neutralizes) selling price columns if present:
--   - unit_price / sale_price / cost_price
-- Prices should come from the pricelist instead.
-- ============================================================

DO $$
BEGIN
  -- If the table does not exist, skip (no error).
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'products';
  IF NOT FOUND THEN
    RAISE NOTICE 'public.products does not exist - skipping';
    RETURN;
  END IF;

  -- ------------------------------------------------------------
  -- Core columns the app expects (multi-tenant)
  -- ------------------------------------------------------------
  BEGIN
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  EXCEPTION WHEN undefined_table THEN
    -- organizations table missing
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS organization_id uuid;
  END;

  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text DEFAULT 'pcs';
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity numeric(12,2) DEFAULT 0;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric(12,2) DEFAULT 0;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

  -- ------------------------------------------------------------
  -- Extra product fields used by the New Product form
  -- ------------------------------------------------------------
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_unit integer;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_qty numeric(12,2) DEFAULT 0;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id uuid;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS empties_type text;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS taxable boolean DEFAULT true;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS returnable boolean DEFAULT false;

  -- Empties valuation (keep on products)
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bottle_cost numeric(12,2) DEFAULT 0;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS plastic_cost numeric(12,2) DEFAULT 0;

  -- ------------------------------------------------------------
  -- Remove/neutralize selling price columns (pricelist owns prices)
  -- ------------------------------------------------------------
  -- Some schemas have NOT NULL constraints; drop NOT NULL first, then drop columns.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='unit_price'
  ) THEN
    BEGIN
      ALTER TABLE public.products ALTER COLUMN unit_price DROP NOT NULL;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  ALTER TABLE public.products DROP COLUMN IF EXISTS unit_price CASCADE;
  ALTER TABLE public.products DROP COLUMN IF EXISTS sale_price CASCADE;
  ALTER TABLE public.products DROP COLUMN IF EXISTS cost_price CASCADE;

  -- ------------------------------------------------------------
  -- Helpful indexes (safe if already exist)
  -- ------------------------------------------------------------
  CREATE INDEX IF NOT EXISTS idx_products_organization ON public.products(organization_id);
  CREATE INDEX IF NOT EXISTS idx_products_org_sku ON public.products(organization_id, sku);

  -- Optional uniqueness (only if org_id exists and sku is used)
  -- NOTE: If you have existing duplicate SKUs per org, this will fail.
  -- Uncomment when ready:
  -- CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_sku_unique ON public.products(organization_id, sku) WHERE sku IS NOT NULL;

  -- ------------------------------------------------------------
  -- RLS policies (align with other tenant tables)
  -- ------------------------------------------------------------
  BEGIN
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN insufficient_privilege THEN
    -- ignore if user can't enable RLS
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Users can read own org products" ON public.products;
    CREATE POLICY "Users can read own org products" ON public.products FOR SELECT
      USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

    DROP POLICY IF EXISTS "Users can insert own org products" ON public.products;
    CREATE POLICY "Users can insert own org products" ON public.products FOR INSERT
      WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
  EXCEPTION WHEN syntax_error_or_access_rule_violation THEN
    -- This exception block is only here to keep the script resilient; continue.
    NULL;
  END;

  -- Update and delete policies (separate BEGIN to avoid halting if auth schema not present)
  BEGIN
    DROP POLICY IF EXISTS "Users can update own org products" ON public.products;
    CREATE POLICY "Users can update own org products" ON public.products FOR UPDATE
      USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

    DROP POLICY IF EXISTS "Users can delete own org products" ON public.products;
    CREATE POLICY "Users can delete own org products" ON public.products FOR DELETE
      USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

END $$;

