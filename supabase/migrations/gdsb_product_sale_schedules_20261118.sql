-- GD Spark & Bloom only. Add optional start/end times to existing product sale prices.
-- IMPORTANT: run on the GD Spark & Bloom Supabase project, never on Vendstal or Urapo.
DO $$
BEGIN
 IF to_regclass('public.gdsb_products') IS NULL
    OR to_regclass('public.gdsb_settings') IS NULL
    OR to_regclass('public.gdsb_promotions') IS NULL THEN
   RAISE EXCEPTION 'Not a GD Spark & Bloom storefront database';
 END IF;
END $$;

ALTER TABLE public.gdsb_products
  ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;

DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.gdsb_products'::regclass
    AND conname='gdsb_sale_schedule_dates'
 ) THEN
  ALTER TABLE public.gdsb_products
   ADD CONSTRAINT gdsb_sale_schedule_dates
   CHECK ((sale_starts_at IS NULL OR sale_ends_at IS NOT NULL)
       AND (sale_starts_at IS NULL OR sale_ends_at > sale_starts_at));
 END IF;
END $$;
-- Existing sale_price values remain unchanged and active unless a new schedule is set.
-- No product, price, customer, order or inventory rows are rewritten.
