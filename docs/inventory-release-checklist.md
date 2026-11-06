# GD Spark & Bloom — Inventory release checklist

**Status:** Code staged on branch `gdsb-stock-quantity-safe-20261106`. Not released to production. Never use Vendstal credentials or database.

## Database prerequisite
- Verify the intended Supabase project is the **dedicated GD Spark & Bloom project** (not `vendstal` or `vendstal-staging`).
- Take a read-only backup of GD products/orders before running any migration.
- Apply `supabase/migrations/gdsb_stock_quantity_reservations.sql` only in the verified GD database.
- Existing products begin at **zero available units**. Do not guess their counts. Set each product's actual available units through the new admin form after deployment.
- Legacy orders have `stock_tracked=false`; their status changes must not change inventory.
- Verify only `service_role` has EXECUTE on the two inventory RPC functions; direct browser roles remain denied.

## Release order
1. Coordinate a short checkout pause to avoid accepting orders while the old (non-inventory-aware) backend is still live.
2. Apply and verify the migration on the dedicated GD project.
3. Deploy the reviewed `gdsb-stock-quantity-safe-20261106` code to the GD production branch and verify READY.
4. Assign the existing `gdsparkandbloom.com.ng` domain to the verified deployment; do not change DNS.
5. In Admin → Products, edit **each existing product** and enter its real stock count; count 0 means sold out.
6. Check public catalogue, product pages, admin stock field, cart quantity caps, and a controlled test checkout.
7. Confirm simultaneous checkouts cannot oversell, and cancellation / payment rejection restores reserved stock exactly once.
8. Restore normal ordering only when the checks pass.

## Reservation behavior
- Successful receipt-backed order submission atomically reserves product quantities and creates the order and items.
- Pending verification holds stock.
- Cancelled or Payment not confirmed releases stock once.
- Reactivating an order reserves stock again, or refuses if unavailable.
- No stock is reserved by adding an item to a cart.
- If stock runs out after a buyer has transferred money but before submitting a receipt, give them a clear way to contact the vendor before transferring again.

## Rollback note
Do not roll production code back to its non-inventory-aware checkout after real stock-reserved orders have been accepted. It would bypass reservation tracking. Stop checkout and reconcile orders and stock first.
