# Scheduled product sale prices — release handoff (2026-11-18)

## Scope
- Independent product sale start and end date/time, saved as UTC timestamps.
- Multiple product prices can receive the same date window in one authenticated admin operation (1–200 products).
- Admin may copy a promotional banner's start/end times. This COPIES dates; later editing or disabling that banner does not change the product schedule.
- Legacy product sale prices with no schedule remain valid until an admin schedules them, preventing unintentional price changes.
- Storefront, cart, product SEO/JSON-LD and server checkout calculate effective prices by time. The atomic Postgres order function checks the same dates while holding inventory locks.
- Sale expiry returns customer-visible price to the regular price without cron jobs. The previously entered sale price is retained in the admin database for historical visibility/reuse, but is no longer applied when the schedule ends.
- Changing or removing sale dates requires admin authentication. Existing product quantities, reviews, banners, orders and inventory security stay unchanged.

## Blocker before publishing
GD Spark & Bloom's separate Supabase account is **not connected** to this ChatGPT session. Available linked Supabase projects belong to Vendstal and Urapo, which must never receive this migration.

## Safe release sequence
1. Connect the dedicated **GD Spark & Bloom** Supabase account (not Vendstal/Urapo).
2. Verify the account and inspect current GD product schema and the deployed `gdsb_place_order` definition.
3. Apply **only on that verified GD project**: `supabase/migrations/gdsb_product_sale_schedules_20261118.sql`.
4. Check that existing product and order counts/prices are preserved, new date columns exist, and only service_role can execute `gdsb_place_order`.
5. Verify the scheduled-sale PR passes `npm run check` and `npm test`. Test a future, current and expired sale, both with inventory limits on/off. Use only synthetic test fixtures.
6. Merge to `gdsb-vercel` and confirm Vercel builds successfully. Verify the **actual custom domain** points to the new production deployment; branch preview deployment is not sufficient.
7. Test admin single save, admin bulk schedule, storefront regular price after expiry, and server quote/atomic order price consistency.

## Rollback
- If frontend checkout behaves unexpectedly, return the live Vercel custom domain to the prior verified deployment. Avoid reverting the additive database columns or historic data. The additive schema change is non-destructive.
- Never force-push the production branch or change Cloudflare DNS for this feature.

## No extra services needed
The timed price check is calculated on each request and at browser boundary changes; no paid scheduler, cron or third-party service is required.
