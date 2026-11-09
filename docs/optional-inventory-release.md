# GD Spark & Bloom — optional stock limits and customer quantity visibility

**Branch:** \`gdsb-optional-stock-control-20261109\`
**Status:** code only, NOT production. Do not deploy until the dedicated GD Supabase migration is applied and verified.
**Forbidden targets:** Vendstal, Vendstal Staging. Never use either database.

## Approved behavior

- Admin → Products displays two separate switches:
  1. **Enable stock limits** — controls whether numerical inventory is enforced.
  2. **Show available numbers to customers** — controls public numerical labels, only applicable when stock limits are on.
- Each product retains its own editable **Available quantity** input in the Add/Edit form, even when limits are off.
- **Normal selling (limits OFF):** quantities are stored but neither checked nor deducted. Customers can order products marked **Available for sale** even with quantity 0; standard input/amount/security checks remain.
- **Limited stock (limits ON):** zero quantity becomes sold out. Cart and checkout cap to the available units; successful receipt-backed order submissions reserve and decrement quantities atomically.
- **Show counts ON:** customer storefront cards, cart and product detail pages show remaining counts. Counts update after order submissions when the API reloads.
- **Show counts OFF:** customer-facing count labels and insufficient-stock alerts are generic, but the numerical backend limit remains enforced. Admin still sees counts.
- Hidden or **Available for sale OFF** products remain unavailable regardless of the global inventory mode.
- Pending orders placed in limited mode reserve stock. Rejected/cancelled orders release stock as before. Orders placed in normal mode do not reserve stock and never restock on cancellation.

## DATABASE FIRST

1. In the **dedicated GD Spark & Bloom Supabase project**, backup existing products/orders/settings.
2. Run \`supabase/migrations/gdsb_stock_controls_optional.sql\` in that project's SQL Editor; do not run any other migrations again.
3. SQL changes just two settings columns and replaces \`gdsb_place_order\` while retaining all prior safeguards (including calling_phone).
4. Verify using:

\`\`\`sql
select id, inventory_enabled, inventory_show_quantity
from public.gdsb_settings where id=1;

select position('v_limits_enabled' in
  pg_get_functiondef('public.gdsb_place_order(jsonb,jsonb)'::regprocedure)) > 0
  as order_function_supports_modes;
\`\`\`

Expected after migration: one settings row with \`inventory_enabled = true\`, \`inventory_show_quantity = false\`, and \`order_function_supports_modes = true\`. Default true preserves the currently active inventory restriction until admin turns it off.

## RELEASE CHECKLIST

1. Confirm SQL succeeded in the correct GD Supabase database; existing paid orders and stock counts unchanged.
2. Fast-forward \`gdsb-vercel\` to the reviewed feature commit, verify a READY **production** deployment.
3. Verify product API and product pages report current availability, and no checkout/receipt/admin routes regress.
4. Assign both existing domains \`gdsparkandbloom.com.ng\` and \`gd-spark-and-bloom.vercel.app\` to the new READY deployment; do not touch DNS.
5. Sign in to Admin → Products, disable limits for normal selling; verify product with 0 stored quantity can be added to cart and quoted without changing quantities.
6. Fill in actual per-product amounts, enable limits; confirm 0-unit products are sold out, counts can be shown/hidden, and a controlled paid test deducts exact quantity.
7. Verify rejected or cancelled limited orders restock once, while normal-mode orders do not modify stock.
8. Monitor live order logs before confirming completion.

## ROLLBACK SAFETY
The migration is backwards-compatible while \`inventory_enabled=true\`: old checkout continues to reserve stock. However **after unlimited-mode orders are accepted**, rolling back to the old inventory-only checkout would wrongly block products with 0 recorded units. Do not roll back live checkout without first disabling new orders and checking stock/order history.
