// Pure HTML/XML builders for public, server-rendered product search pages.
// The database remains the source of truth for product names, prices and availability.
export const ORIGIN='https://gdsparkandbloom.com.ng';
export const productIdValid=id=>/^[A-Za-z0-9_-]{1,80}$/.test(String(id||''));
export const productUrl=id=>ORIGIN+'/products/'+encodeURIComponent(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validImage=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='res.cloudinary.com'?u.toString():''}catch{return ''}};
const productDescription=p=>String(p.description||'').trim()||('View price, availability and ordering details for '+p.name+' at GD Spark & Bloom. Ask the store for ingredients and suitability information before purchasing.');
const displayPrice=p=>{
 const regular=Number(p.price),sale=Number(p.salePrice||0);
 return sale>0&&sale<regular?sale:regular;
};
export function renderProductPage(p){
 if(!p||!productIdValid(p.id)||p.hidden)throw new Error('Invalid public product');
 const url=productUrl(p.id),name=String(p.name||'').trim(),category=String(p.category||'Wellness products').trim();
 const price=displayPrice(p),image=validImage(p.image),inStock=!!p.stock,description=productDescription(p);
 if(!name||!Number.isFinite(price)||price<0)throw new Error('Invalid product data');
 const title=(name+' | GD Spark & Bloom Nigeria').slice(0,120);
 const metaDescription=(String(p.description||'').trim()||('Shop '+name+' in '+category+' at GD Spark & Bloom Nigeria. Check current pricing and availability.')).slice(0,160);
 const offer={ '@type':'Offer',url,priceCurrency:'NGN',price,availability:inStock?'https://schema.org/InStock':'https://schema.org/OutOfStock',
 seller:{'@type':'Organization',name:'GD Spark & Bloom',url:ORIGIN+'/'} };
 const product={'@type':'Product',name,description,sku:String(p.id),category,offers:offer};
 if(image)product.image=[image];
 const breadcrumb={'@type':'BreadcrumbList',itemListElement:[
  {'@type':'ListItem',position:1,name:'Home',item:ORIGIN+'/'},
  {'@type':'ListItem',position:2,name:'Shop',item:ORIGIN+'/shop.html'},
  {'@type':'ListItem',position:3,name,item:url}
 ]};
 const schema=JSON.stringify({'@context':'https://schema.org','@graph':[product,breadcrumb]}).replace(/</g,'\\u003c');
 const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(price);
 const onSale=Number(p.salePrice)>0&&Number(p.salePrice)<Number(p.price);
 const oldPrice=onSale?'<del>'+new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(p.price)+'</del>':'';
 const imageHtml=image?'<img src="'+esc(image)+'" alt="'+esc(name)+'" fetchpriority="high" width="700" height="700">':'<div class="no-image">Product image not available</div>';
 const jsId=JSON.stringify(String(p.id)).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>'+esc(title)+'</title><meta name="description" content="'+esc(metaDescription)+'"><meta name="robots" content="index,follow">'+
 '<link rel="canonical" href="'+esc(url)+'"><meta property="og:type" content="product"><meta property="og:locale" content="en_NG">'+
 '<meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(metaDescription)+'"><meta property="og:url" content="'+esc(url)+'">'+
 (image?'<meta property="og:image" content="'+esc(image)+'">':'')+
 '<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.ico"><script type="application/ld+json">'+schema+'</script>'+
 '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'+
 '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'+
 '<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fffdf1;color:#171610;font-family:"DM Sans",sans-serif}a{color:inherit}header{background:#fffdf1;border-bottom:1px solid #eee8cb}header nav{max-width:1120px;margin:auto;display:flex;align-items:center;justify-content:space-between;padding:16px 22px;gap:16px}header nav .brand{display:flex;align-items:center;gap:9px;text-decoration:none;font-family:Manrope,sans-serif;font-weight:800;letter-spacing:-.03em}header nav img{width:43px;height:43px;object-fit:contain}header nav .actions{display:flex;gap:15px;font-weight:700;font-size:14px}main{max-width:1120px;margin:0 auto;padding:26px 22px 80px}.crumb{display:flex;gap:9px;flex-wrap:wrap;font-size:13px;color:#706d59;margin:9px 0 30px}.crumb a{text-decoration:none}.detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:start}.photo{background:#fff;border:1px solid #eee8cb;border-radius:22px;overflow:hidden;aspect-ratio:1}.photo img{display:block;width:100%;height:100%;object-fit:contain}.no-image{display:grid;place-items:center;height:100%;color:#777}.category{font-weight:800;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#615700;margin:6px 0 12px}h1{font-family:Manrope,sans-serif;font-size:clamp(28px,4vw,48px);line-height:1.12;letter-spacing:-.055em;margin:0 0 20px}.price{font-size:27px;font-weight:800;margin:0 0 14px}.price del{font-size:15px;color:#898574;margin-left:12px;font-weight:500}.availability{font-weight:700;margin:0 0 20px}.availability.ok{color:#206d3c}.availability.no{color:#8a4f30}.desc{line-height:1.7;color:#484432;margin-bottom:24px;white-space:pre-wrap}.primary{background:#ffe000;border:1px solid #ffe000;border-radius:28px;padding:14px 24px;font:800 15px "DM Sans",sans-serif;cursor:pointer;text-decoration:none;display:inline-block;color:#171610}.primary:disabled{background:#eee8cb;border-color:#eee8cb;cursor:not-allowed}.secondary{display:inline-block;margin-left:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px}.hint{font-size:13px;color:#77715a;line-height:1.6;margin-top:22px}footer{padding:28px 22px;border-top:1px solid #eee8cb;text-align:center;font-size:13px;color:#77715a}@media(max-width:680px){header nav{padding:12px 16px}header nav .actions{gap:10px}main{padding:20px 16px 56px}.detail{grid-template-columns:1fr;gap:22px}.photo{max-height:65vh}.secondary{margin:15px 0 0;display:block}.crumb{margin-bottom:18px}}</style>'+
 '</head><body><header><nav aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/gdsb-logo.png" alt="GD Spark & Bloom logo"><span>GD Spark & Bloom</span></a><span class="actions"><a href="/shop.html">Shop</a><a href="/cart.html">Cart</a></span></nav></header>'+
 '<main><nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/shop.html">Shop</a><span>/</span><span>'+esc(name)+'</span></nav>'+
 '<article class="detail"><div class="photo">'+imageHtml+'</div><div class="info"><div class="category">'+esc(category)+'</div><h1>'+esc(name)+'</h1>'+
 '<p class="price">'+esc(money)+oldPrice+'</p><p class="availability '+(inStock?'ok':'no')+'">'+(inStock?'Available to order':'Currently unavailable')+'</p>'+
 '<p class="desc">'+esc(description)+'</p><button id="add" class="primary"'+(inStock?'':' disabled')+'>'+(inStock?'Add to cart':'Out of stock')+'</button>'+
 '<a class="secondary" href="/shop.html">See all products</a><p class="hint">Delivery arrangements are confirmed by the store. Ask the vendor if you need ingredient or suitability information.</p></div></article></main>'+
 '<footer>GD Spark & Bloom · Osun State, Nigeria</footer>'+
 '<script>document.getElementById("add").addEventListener("click",function(){const id='+jsId+';const limit='+Math.max(0,Number(p.availableQuantity)||0)+';let cart={};try{cart=JSON.parse(sessionStorage.getItem("gdsb_cart")||"{}");if(!cart||Array.isArray(cart)||typeof cart!=="object")cart={}}catch{}if((Number(cart[id])||0)>=limit){alert("Only "+limit+" unit(s) available");return}cart[id]=Math.min(limit,(Number(cart[id])||0)+1);sessionStorage.setItem("gdsb_cart",JSON.stringify(cart));location.href="/cart.html"});</script>'+
 '</body></html>';
}
export function renderProductSitemap(products){
 const seen=new Set();
 const urls=(Array.isArray(products)?products:[]).filter(p=>p&&!p.hidden&&productIdValid(p.id)&&String(p.name||'').trim()).map(p=>productUrl(p.id)).filter(url=>{if(seen.has(url))return false;seen.add(url);return true});
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>'  <url><loc>'+esc(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
}
