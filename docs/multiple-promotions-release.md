# GD Spark & Bloom — multiple scheduled promotional banners

**Release status:** Prepared on \`gdsb-multi-promo-scheduling-20261116\`. Do not publish without the database migration. This project is separate from Vendstal, Vendstal Staging and other applications.

## Current limitation
The old promotion stored in a single row in \`gdsb_settings\` is overwritten by every new save, with no delete action. This implementation adds independent entries, times, images, status controls and deletion. The permanent homepage hero remains a separate setting and is never deleted by removing a promotion.

## Admin behavior
Admin → Banners:
- Keep existing permanent hero editing intact.
- Create as many promotional banners as required; each has title, subtitle, uploaded image/URL, optional start, end, countdown and enabled status.
- List campaigns with Scheduled, Live now, Ended, Disabled or Active (another promo takes priority) labels.
- Edit, Enable/Disable, Delete each campaign independently.
- Schedule start/end from the browser's local time (converted to UTC ISO for the server).
- Only one promo occupies the hero. With overlapping schedules the latest start wins; newly scheduled banners automatically take over on start, and the permanent hero returns when none are active.
- Banners do not change product prices or stock.

## Migrate BEFORE deploying
1. Use the **dedicated GD Spark & Bloom Supabase project only**.
2. Back up \`gdsb_settings\` and the relevant storefront tables.
3. Run the entire file \`supabase/migrations/gdsb_multi_promotions_20261116.sql\` in Supabase SQL Editor.
4. The SQL creates \`gdsb_promotions\`, enables RLS, denies browser roles, grants \`service_role\` and copies the existing promo **once** (without deleting the old row).
5. Run this verification query:

\`\`\`sql
SELECT
  (SELECT COUNT(*) FROM public.gdsb_promotions) AS promotion_count,
  (SELECT COUNT(*) FROM public.gdsb_promotions WHERE legacy_settings) AS migrated_previous_banner,
  (SELECT relrowsecurity
   FROM pg_class
   WHERE oid = 'public.gdsb_promotions'::regclass) AS rls_enabled;
\`\`\`

Expected: \`rls_enabled=true\`, and for the current GD site \`migrated_previous_banner=1\`; existing promo should retain its start/end/enabled status. Do not invent new campaign dates.

## Release checklist
1. Confirm migration success and inspect the existing promotion.
2. Confirm the main production branch remains at the recorded base before moving it.
3. Deploy reviewed code to \`gdsb-vercel\`, verify Vercel build READY.
4. Confirm \`/api/config\` ready, public \`/api/catalog\` 200 including promotions, and authenticated \`/api/admin/state\` loads banners.
5. Assign both \`gdsparkandbloom.com.ng\` and \`gd-spark-and-bloom.vercel.app\` to the verified production deployment, without changing DNS.
6. Confirm the previous active campaign appears unchanged; test new scheduled banner, disable, edit, delete using test entries and verify fallback to the permanent hero.
7. Check cart, checkout, stock limits, contact numbers, SEO, review slideshow and certificate remain unchanged.

## Rollback
If a frontend release fails, the new promotions table can remain in Supabase; it does not alter the old \`gdsb_settings\` row. The former frontend may still render the old single campaign. Do not delete the new table or run destructive rollback SQL.
