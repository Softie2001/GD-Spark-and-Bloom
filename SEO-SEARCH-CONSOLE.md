# GD Spark & Bloom — SEO and Google Search Console

Website: https://gdsparkandbloom.com.ng/
Sitemap: https://gdsparkandbloom.com.ng/sitemap.xml
Robots: https://gdsparkandbloom.com.ng/robots.txt

## Existing and deployed technical SEO
- Unique page titles, descriptions, canonical URLs, Open Graph tags and Nigerian locale.
- 7 public pages in the XML sitemap: home, shop, kits, about, FAQ, contact, privacy.
- OnlineStore and WebSite structured data on the home page; BreadcrumbList on other public pages.
- Admin, cart, checkout, payment and success stay noindex; /api/ is disallowed in robots.txt.
- Do NOT add actual customer/private orders, receipts, admin routes, or invented medical claims to SEO pages.

## Complete Google Search Console verification (user action required)
1. Go to https://search.google.com/search-console and sign in with the Google account you want to manage this store.
2. Add a **Domain property**: `gdsparkandbloom.com.ng` (no https://).
3. Google gives a unique **TXT** verification value. Copy exactly.
4. In Cloudflare, select the GD Spark & Bloom domain > DNS > Records > Add record:
   - Type: TXT
   - Name: @ (Cloudflare zone apex)
   - Content: Google's exact `google-site-verification=...` value.
   - TTL: Auto.
5. Save only this NEW TXT record. Do not edit existing A, AAAA, CNAME, MX, DKIM, SPF, or other records.
6. Return to Search Console and select Verify. DNS propagation may take time.
7. Open Search Console > Sitemaps and submit `sitemap.xml`; look for **Success**. A submitted sitemap does not guarantee pages are indexed.
8. Use URL Inspection for `https://gdsparkandbloom.com.ng/`, `/shop.html` and `/kits.html`; use Test Live URL and Request Indexing when eligible.
9. Check Indexing > Pages and Performance > Search results periodically. Check mobile rendering and that visible product content is rendered in Google's inspection.
10. Use Google Rich Results Test to inspect Organization and BreadcrumbList schema. Do not assume products qualify for Product rich results: Google recommends individual, canonical product-detail pages with genuine prices and availability.

## Important
This documentation is NOT a claim that Google Search Console has been verified or that any page is indexed. Verification and sitemap submission require the website owner's Google account. No paid service is required.
