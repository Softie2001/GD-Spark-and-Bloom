-- GD Spark & Bloom ONLY. Run in the dedicated GD Supabase SQL Editor.
-- Preserves the permanent homepage hero, existing promotion settings and orders.
-- Copies any current/previous legacy promotion exactly once.
BEGIN;

DO $guard$
BEGIN
 IF to_regclass('public.gdsb_settings') IS NULL
 OR to_regclass('public.gdsb_products') IS NULL THEN
  RAISE EXCEPTION 'Not a GD Spark & Bloom storefront database';
 END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS public.gdsb_promotions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 90),
 subtitle text NOT NULL DEFAULT '' CHECK (length(subtitle) <= 160),
 image_url text NOT NULL DEFAULT '',
 starts_at timestamptz,
 ends_at timestamptz,
 enabled boolean NOT NULL DEFAULT false,
 countdown boolean NOT NULL DEFAULT true,
 legacy_settings boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT gdsb_promotions_dates_order
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
 CONSTRAINT gdsb_promotions_enabled_end
  CHECK (NOT enabled OR ends_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS gdsb_promotions_one_legacy
 ON public.gdsb_promotions(legacy_settings) WHERE legacy_settings;
CREATE INDEX IF NOT EXISTS gdsb_promotions_schedule
 ON public.gdsb_promotions(enabled,starts_at,ends_at);

-- Backfill the original single-promotion settings. Never delete or rewrite them.
INSERT INTO public.gdsb_promotions
 (title,subtitle,image_url,starts_at,ends_at,enabled,countdown,legacy_settings)
SELECT
 LEFT(btrim(COALESCE(NULLIF(s.promo_title,''),'Previous promotion')),90),
 LEFT(COALESCE(s.promo_subtitle,''),160),
 COALESCE(s.promo_image,''),
 CASE WHEN s.promo_starts_at IS NOT NULL AND s.promo_ends_at IS NOT NULL
           AND s.promo_starts_at >= s.promo_ends_at THEN NULL
      ELSE s.promo_starts_at END,
 s.promo_ends_at,
 COALESCE(s.promo_enabled,false) AND s.promo_ends_at IS NOT NULL,
 COALESCE(s.promo_countdown,true),true
FROM public.gdsb_settings AS s
WHERE s.id=1
 AND (
  COALESCE(s.promo_enabled,false)
  OR NULLIF(btrim(COALESCE(s.promo_image,'')),'') IS NOT NULL
  OR s.promo_starts_at IS NOT NULL
  OR s.promo_ends_at IS NOT NULL
 )
ON CONFLICT (legacy_settings) WHERE legacy_settings DO NOTHING;

-- All promotions remain private to the backend. No direct browser access.
ALTER TABLE public.gdsb_promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gdsb_promotions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.gdsb_promotions TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
