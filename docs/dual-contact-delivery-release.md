# GD Spark & Bloom — Two Contact Numbers (WhatsApp + Calling)

## Release state
Prepared on \`gdsb-dual-contact-delivery-20261106\` only.
Do not push to production until the GD Supabase migration is successful. Do not use Vendstal databases.

## Compatibility
- Existing orders keep their current WhatsApp number; their new calling_phone field is nullable.
- The old checkout can continue writing orders during the migration. It will set calling_phone to NULL.
- The updated checkout collects WhatsApp number (phone) and calling number (callPhone) separately, and the server validates both.
- The existing stock-reserving function must be replaced with the copy in the migration; do not run ALTER TABLE alone.
- The user can enter the same number in both fields.
- Neither number is returned in the public catalogue or sitemap.

## Execute ONLY in the dedicated GD Spark & Bloom Supabase SQL Editor

1. Backup your GD order records.
2. Run \`supabase/migrations/gdsb_dual_contact_delivery.sql\`.
3. Verify:

\`\`\`sql
select column_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name='gdsb_orders'
  and column_name in ('whatsapp','calling_phone')
order by column_name;

select position('calling_phone' in pg_get_functiondef('public.gdsb_place_order(jsonb,jsonb)'::regprocedure)) > 0
  as order_function_saves_calling_phone;
\`\`\`

Expected: both columns exist, calling_phone is nullable for historical orders, and order_function_saves_calling_phone = true.

4. Review the stock reservation function in the migration and confirm the existing stock counters have not changed.
5. Deploy tested branch to \`gdsb-vercel\` with a fast-forward commit check, then ensure the new Vercel deployment is READY.
6. Assign the domain \`gdsparkandbloom.com.ng\` to the new verified build; no DNS changes.
7. Verify two required phone inputs, storage of both numbers after an authorized controlled order, admin order detail, and new order email. Test missing/invalid numbers are blocked.
8. Verify stock reservation/deduction, receipt verification, cancellation and restocking still work.

## Rollback
For frontend-only errors, roll back the Vercel alias after verifying the earlier version. Leave calling_phone column nullable in place so existing records are preserved. Do not blindly roll back the inventory SQL functions.
