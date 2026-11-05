import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='https://gdsparkandbloom.com.ng';
const publicPages=['index.html','shop.html','kits.html','about.html','faq.html','contact.html','privacy.html'];
const privatePages=['admin.html','admin-product.html','cart.html','checkout.html','payment.html','success.html'];
const sitemap=fs.readFileSync('sitemap.xml','utf8');
const robots=fs.readFileSync('robots.txt','utf8');
assert.match(sitemap,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.equal((sitemap.match(/<url><loc>/g)||[]).length,7);
assert.match(robots,/Sitemap: https:\/\/gdsparkandbloom\.com\.ng\/sitemap\.xml/);
assert.match(robots,/Disallow: \/api\//);
for(const file of publicPages){
 const h=fs.readFileSync(file,'utf8');
 const href=file==='index.html'?'/':'/'+file;
 assert.match(h,/<meta name="robots" content="index,follow">/,file);
 assert.ok(h.includes('<link rel="canonical" href="'+origin+href+'">'),file);
 assert.ok(h.includes('<meta property="og:url" content="'+origin+href+'">'),file);
 assert.match(h,/<meta property="og:image" content="https:\/\/gdsparkandbloom\.com\.ng\/assets\/gdsb-logo\.png">/);
 assert.match(h,/<meta name="twitter:card" content="summary">/);
 assert.ok(sitemap.includes('<loc>'+origin+href+'</loc>'),file);
 assert.equal((h.match(/<title>/g)||[]).length,1,file);
 assert.equal((h.match(/<meta name="description"/g)||[]).length,1,file);
}
for(const file of privatePages){
 const h=fs.readFileSync(file,'utf8');
 assert.match(h,/<meta name="robots" content="noindex,nofollow">/,file);
 assert.ok(!sitemap.includes('/'+file+'</loc>'),file+' must not be in sitemap');
 assert.ok(!robots.includes('Disallow: /'+file),'robots should allow noindex to be read for '+file);
}
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert.ok(config.crons.some(x=>x.path==='/api/receipt-cleanup'&&x.schedule==='0 3 * * *'),'20-day receipt cleanup cron preserved');
for(const file of privatePages){
 const rule=config.headers.find(x=>x.source==='/'+file);
 assert.ok(rule,'Missing technical headers for '+file);
 assert.ok(rule.headers.some(x=>x.key.toLowerCase()==='x-robots-tag'&&x.value.includes('noindex')),'Missing X-Robots-Tag for '+file);
}
assert.match(fs.readFileSync('index.html','utf8'),/"@type":"Organization"/);
console.log('PASS | 7 public pages in sitemap, unique SEO metadata, canonical & social tags');
console.log('PASS | Admin, cart, checkout, payment, success excluded by crawlable noindex');
console.log('PASS | Vercel security headers and receipt cleanup cron preserved');

// Clean admin aliases must retain security headers and preserve other SEO rules.
for(const [alias,html] of [['/admin','/admin.html'],['/admin-product','/admin-product.html']]){
 assert.ok(config.rewrites?.some(r=>r.source===alias&&r.destination===html),'Missing admin alias '+alias);
 const rule=config.headers.find(r=>r.source===alias);
 assert.ok(rule?.headers.some(h=>h.key.toLowerCase()==='x-robots-tag'&&h.value.includes('noindex')),'Missing noindex on '+alias);
 assert.ok(rule?.headers.some(h=>h.key.toLowerCase()==='cache-control'&&h.value==='no-store'),'Missing no-store on '+alias);
}
console.log('PASS | clean admin aliases are private and uncached');
