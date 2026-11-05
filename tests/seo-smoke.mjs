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
assert.match(fs.readFileSync('index.html','utf8'),/"@type":"OnlineStore"/);
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


const ldJson=(html)=>[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
const home=fs.readFileSync('index.html','utf8');
const homeGraph=ldJson(home).flatMap(x=>x['@graph']||[x]);
const store=homeGraph.find(x=>x['@type']==='OnlineStore');
const website=homeGraph.find(x=>x['@type']==='WebSite');
assert.ok(store&&website,'OnlineStore and WebSite JSON-LD must exist');
assert.equal(store.url,origin+'/');
assert.equal(store.logo,origin+'/assets/gdsb-logo.png');
assert.ok(store.sameAs.includes('https://www.instagram.com/gdsparkandbloom/'));
assert.equal(website.publisher['@id'],store['@id']);
assert.equal(website.inLanguage,'en-NG');
for(const file of publicPages){
 const html=fs.readFileSync(file,'utf8');
 assert.ok(html.includes('<meta property="og:locale" content="en_NG">'),'Missing Nigerian social locale '+file);
 const schemas=ldJson(html);
 assert.equal(schemas.length,1,'Expected exactly one validated JSON-LD block in '+file);
 if(file==='index.html')continue;
 const bread=schemas[0];
 assert.equal(bread['@type'],'BreadcrumbList');
 assert.equal(bread.itemListElement.length,2);
 assert.equal(bread.itemListElement[0].item,origin+'/');
 assert.equal(bread.itemListElement[1].item,origin+'/'+file);
}
console.log('PASS | OnlineStore, WebSite and six BreadcrumbList schemas valid; social locale en_NG');


/* Googlebot needs to fetch public JSON APIs to render the genuine product catalogue. */
assert.match(robots,/^Allow: \/api\/config$/m);
assert.match(robots,/^Allow: \/api\/catalog$/m);
assert.match(robots,/^Disallow: \/api\/$/m);
const crawlRules=robots.split(/\r?\n/).map(line=>line.match(/^(Allow|Disallow):\s*(\S+)/)).filter(Boolean).map(m=>({rule:m[1],pattern:m[2]}));
function robotsAllows(path){
 const matches=crawlRules.filter(r=>path.startsWith(r.pattern));
 matches.sort((a,b)=>b.pattern.length-a.pattern.length||Number(b.rule==='Allow')-Number(a.rule==='Allow'));
 return !matches.length||matches[0].rule==='Allow';
}
for(const path of ['/api/config','/api/catalog','/api/catalog?preview=1']){
 assert.ok(robotsAllows(path),'Storefront rendering endpoint blocked: '+path);
}
for(const path of ['/api/admin/state','/api/orders','/api/receipt-cleanup']){
 assert.ok(!robotsAllows(path),'Private API accidentally crawlable: '+path);
}
const apiHeaders=config.headers.find(h=>h.source==='/api/(.*)')?.headers||[];
assert.ok(apiHeaders.some(h=>h.key.toLowerCase()==='x-robots-tag'&&h.value.includes('noindex')),'JSON API noindex header missing');
assert.ok(apiHeaders.some(h=>h.key.toLowerCase()==='x-content-type-options'&&h.value==='nosniff'),'API nosniff header lost');
console.log('PASS | Googlebot can fetch public catalogue and config; private APIs remain robots-disallowed; JSON API responses noindex');
