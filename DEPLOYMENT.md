# GD Spark & Bloom — V15 backend + email + Vercel rollout

**Status:** setup package, not connected to live accounts or production payments yet. Do not direct real customers to checkout until the end-to-end test passes. The existing GitHub Pages site and Cloudflare records have NOT been changed by this package.

## 1. Separate project, not Vendstal

The user's connected Supabase projects are `vendstal` and `vendstal-staging`. This shop **must** use a separate project named `gd-spark-and-bloom`. Ask the user which Supabase organization to use; check and confirm any nonzero project cost before creating it. Do **not** run the schema against either Vendstal project.

After project creation, review and run `supabase/schema.sql` in the GD project SQL Editor (the authenticated operator can use Supabase MCP to apply and verify). Confirm tables `gdsb_*`, `storage.buckets` private `gdsb-receipts` (private only); product/banner images live in Cloudinary, and RLS enabled for every table. Do not import the placeholder demo orders or invented sample reviews.

## 2. Admin authentication

Create the vendor's real admin account from the **new** Supabase project's Authentication dashboard. Prefer a verified email, strong password and MFA where offered. Get that user's UUID from Auth -> Users. Add it to the allowlist (not raw user_metadata):

```sql
insert into public.gdsb_admin_members(user_id)
values ('ACTUAL_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

The storefront has no customer login. Only the admin signs in; admin API calls validate the Supabase access token and query `gdsb_admin_members` before allowing access. No database secret appears in browser code.

## 3. Resend for admin new-order notifications

In Resend, verify the **GD Spark & Bloom sending domain or subdomain** (don't silently reuse `vendstal.com`). Publish the exact domain verification DKIM/SPF records Resend provides through Cloudflare DNS; preserve existing GitHub Pages, mail and other DNS records. Create a Sending Access key and **enter it only in Vercel environment settings**. Never paste it into chat, commit it or expose it in client JS.

Set `RESEND_FROM` to a verified sender e.g. `GD Spark & Bloom <orders@your-verified-domain>`. Set `ADMIN_NOTIFY_EMAIL` to the real inbox that the vendor checks on their phone. Resend sends a concise email containing order reference, customer name, WhatsApp and amount; it does not attach private receipts. The email directs the vendor to the secure admin dashboard. Check bank credits separately; uploaded receipts are not automatic proof of payment.

## 4. Cloudinary product images + private receipts

Cloudinary is the **only public image backend** for newly uploaded products and promotional banners. Save `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in Vercel environment settings. The API uses server-side authenticated Cloudinary upload and stores the returned secure CDN URL in the product/banner database record. The Cloudinary API Secret must never appear in browser JavaScript. Public Cloudinary URLs from the configured cloud can also be entered directly in admin.

Receipts contain private financial/customer information. They are **not** placed in Cloudinary public media: keep them in the private Supabase Storage bucket, available only through short-lived URLs to authorized admin users.

## 5. Cloudflare Turnstile (required before real order submissions)

Create a Turnstile widget for the Vercel preview domain and later the final domain. Save its site key as `TURNSTILE_SITE_KEY` and the secret in **Vercel-only** `TURNSTILE_SECRET_KEY`. This protects the public receipt submission endpoint. Without the widget, new online orders are intentionally blocked.

## 6. Vercel preview without disrupting GitHub Pages

GitHub connector currently exposes only the `Softie2001/vendstal` repository. The specific GitHub Pages repository for GD Spark & Bloom is not yet accessible to this session; confirm or connect the correct repo before creating a Vercel Git integration.

**Safe order of operations:**

1. In the **correct GD Spark & Bloom repository**, create a new branch `gdsb-vercel` from the current published branch. Do not overwrite the live GitHub Pages branch.
2. Put **all files from this package** in the root of `gdsb-vercel`. Preserve the `assets/`, `api/`, `lib/` and `supabase/` folders.
3. Create a Vercel project linked to this GitHub repository. In **Settings -> Git**, select `gdsb-vercel` as the production branch before any public custom-domain cutover; or deploy a non-production preview from this branch. Vercel deploys static pages and `api/` serverless functions.
4. In Vercel project **Settings -> Environment Variables**, set the variables below. Save credentials directly there and configure Preview first. Redeploy after changing environment variables.
5. Set `SITE_ORIGIN` to the precise HTTPS Vercel preview origin; add the Vercel hostname in Turnstile allowed hostnames. The API is deliberately unavailable when required environment settings are missing.
6. Confirm `/api/config` reports `ready:true, checkoutReady:true`. Confirm empty catalogue until the admin enters **real** products.
7. Test admin login, adding a product, homepage category, coupon, kit, banners, public order, private receipt and Resend mail. Confirm amount **in the bank app** before pressing payment confirmed. Test reject/WhatsApp/delivery messages.
8. When verified, add the business's **exact existing Cloudflare-managed domain** to Vercel and obtain the **project-specific** A/CNAME/TXT records required by Vercel. Apply only those web-host records in Cloudflare. Do **not** change domain nameservers or remove Resend SPF/DKIM/MX. Keep existing DNS records until the target Vercel preview is verified. Verify HTTPS and the final storefront before removing GitHub Pages routing.
9. Confirm `SITE_ORIGIN`, Resend verified sending domain and Turnstile hostname are correct for the final domain. Update the sitemap placeholder URL to the approved final domain.

### Vercel environment variables

| Variable | Visibility | Purpose |
|---|---|---|
| `SUPABASE_URL` | server | New GD database API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret, server only** | Privileged database/storage operations |
| `SUPABASE_ANON_KEY` | server | Verify Supabase Auth logins and JWTs |
| `RESEND_API_KEY` | **secret, server only** | Send new-order admin emails |
| `RESEND_FROM` | server | Verified brand sender |
| `ADMIN_NOTIFY_EMAIL` | server | Vendor's recipient inbox |
| `SITE_ORIGIN` | server | Exact HTTPS preview/final site URL |
| `TURNSTILE_SITE_KEY` | public value but configured on Vercel | CAPTCHA widget |
| `TURNSTILE_SECRET_KEY` | **secret, server only** | Verify challenges |
| `ADMIN_REPLY_TO` | optional server | Verified mailbox customers can reply to |
| `CLOUDINARY_CLOUD_NAME` | server | Cloudinary store media account |
| `CLOUDINARY_API_KEY` | **secret, server only** | Cloudinary image upload |
| `CLOUDINARY_API_SECRET` | **secret, server only** | Cloudinary image upload |

**Never expose** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` or `TURNSTILE_SECRET_KEY` with a `NEXT_PUBLIC_` prefix, in GitHub, screenshots, client source or emails.

## 7. Acceptance checklist

- [ ] Separate Supabase project created and SQL applied only there
- [ ] RLS enabled; unauthenticated users cannot list orders or receipt bucket
- [ ] Real admin Auth account explicitly allowlisted
- [ ] Product create/edit/hide/kit/stock/category flows persist across browsers
- [ ] Coupon applies only to eligible products or entire order, recalculated by server
- [ ] Bank details verified by business before displaying to buyers
- [ ] Images uploaded to Cloudinary, new CDN links verified; private receipt stored in Supabase (1MB max JPG/PNG/WebP) and displayed to admin only
- [ ] One order inserted in database with item snapshot and unique reference
- [ ] Resend email **actually received** in admin inbox, checked in Resend logs
- [ ] Payment manually matched against bank credits
- [ ] Domain HTTPS + Cloudflare DNS fully verified; original GitHub Pages kept until cutover
- [ ] Privacy notice reviewed with the business; no invented medical claims/reviews

### Security notes and current limits

- The store uses manual bank transfers. Neither Resend nor Supabase confirms a bank transfer has cleared.
- Browser visitors cannot create accounts. Admin sign-in is required for order/receipt management.
- No fictitious product inventory or review data is seeded to the database.
- Receipt limit is 1 MB per image. Images must be JPG, PNG or WebP. Consider more robust upload flows and malware-scanning at scale.
- The current admin dashboard displays the last 200 orders. Pagination, retention/deletion policy, shipping provider integrations and production stress testing are future work.
- A failed Resend send is stored as a notification error; the order remains in the database. Configure monitoring for failed notifications before high-volume launch.
- For production, review your business's privacy policy under applicable Nigerian data protection requirements and avoid unnecessary collection of health details.

### Connection findings at time of packaging

- Connected Supabase projects: `vendstal` and `vendstal-staging` only. **No database changes were executed** on either project. User wants another Supabase account; its owner must connect it.
- Connected GitHub repositories visible here: `Softie2001/vendstal` only. Do **not** deploy GD Spark & Bloom from that unrelated codebase.
- Vercel shows an unrelated `dj-garvin` project, not an existing GD Spark & Bloom project. No project, deployment or domain was altered.
- Resend, Cloudinary and Cloudflare account secrets have not been provided. **No test emails were sent**. The receiving inbox, sender domain, cloud name and final storefront domain are not yet verified.
