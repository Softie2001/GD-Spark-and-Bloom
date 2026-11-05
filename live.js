/* GD Spark & Bloom — Vercel/Supabase connection layer.
   Runs only after site.js and never exposes the server secret or Resend key. */
'use strict';
let GDSB_LIVE_READY=false, GDSB_CHECKOUT_READY=false, GDSB_ADMIN_OK=false, GDSB_AUTH_TOKEN=sessionStorage.getItem('gdsb_admin_token')||'', GDSB_COUPON_RESULT=null, GDSB_TURNSTILE_ID=null, GDSB_TURNSTILE_SITEKEY='';
const GDSB_IS_ADMIN=['admin','admin-product'].includes(page);
const GDSB_ORIGINAL={render,submitOrder,applyCoupon,changeQty,removeLineItem,saveProduct,saveHeroBanner,savePromoBanner,saveCoupon,saveBank,saveReview};
async function gdsbApi(path,options={}){
 const headers={'Content-Type':'application/json',...(GDSB_AUTH_TOKEN?{'Authorization':'Bearer '+GDSB_AUTH_TOKEN}:{})};
 const r=await fetch('/api/'+path,{...options,headers:{...headers,...options.headers},cache:'no-store'});
 const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.error||'Request failed');return result;
}
function gdsbUnavailable(message='Store setup is in progress. Please contact the vendor on WhatsApp.'){
 document.getElementById('app').innerHTML=`<div class="gdsb-maintenance"><img src="assets/logo.jpeg" alt="GD Spark & Bloom" width="76" height="76"><h1>GD Spark & Bloom</h1><p>${esc(message)}</p><a class="btn btn-primary" href="https://wa.me/${WA}">Chat on WhatsApp</a></div>`;
}
function gdsbAdminLogin(){return `<div class="gdsb-admin-login"><img src="assets/logo.jpeg" alt="GD Spark & Bloom" width="70" height="70"><h1>Admin sign in</h1><p>Only authorised store administrators can manage orders, receipts and products.</p><form onsubmit="gdsbSignIn(event)"><div class="form-field"><label>Email</label><input name="email" type="email" autocomplete="username" required></div><div class="form-field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn btn-primary" type="submit">Sign in</button></form><p id="gdsb-login-message" role="status"></p><a href="index.html">Back to shop</a></div>`}
async function gdsbSignIn(e){e.preventDefault();const d=new FormData(e.target),m=document.querySelector('#gdsb-login-message');m.textContent='Checking your account…';try{
 const result=await gdsbApi('admin/login',{method:'POST',body:JSON.stringify({email:d.get('email'),password:d.get('password')})});
 GDSB_AUTH_TOKEN=result.token;sessionStorage.setItem('gdsb_admin_token',result.token);await gdsbLoadAdmin();
 }catch(error){m.textContent=error.message}}
async function gdsbLoadAdmin(){const d=await gdsbApi('admin/state');GDSB_ADMIN_OK=true;Object.assign(db,d);db.orders=d.orders||[];db.reviews=d.reviews||[];db.coupons=d.coupons||[];render()}
function gdsbSignOut(){GDSB_AUTH_TOKEN='';GDSB_ADMIN_OK=false;sessionStorage.removeItem('gdsb_admin_token');render()}

const _gdsbRender=render;
render=function(){
 if(!GDSB_LIVE_READY){gdsbUnavailable();return}
 if(!GDSB_CHECKOUT_READY&&['checkout','payment'].includes(page)){gdsbUnavailable('Online payment is being configured. Please contact the seller on WhatsApp for now.');return}
 if(GDSB_IS_ADMIN&&!GDSB_ADMIN_OK){document.getElementById('app').innerHTML=gdsbAdminLogin();return}
 _gdsbRender();
 if(page==='payment')gdsbInsertTurnstile();
 if(GDSB_IS_ADMIN){const logout=document.createElement('button');logout.className='sidebtn';logout.innerHTML=icon('logout')+' Sign out';logout.onclick=gdsbSignOut;document.querySelector('.admin-side')?.append(logout)}
}
function reviewsSection(){
 // No fictional testimonials on the real storefront. Genuine consented reviews only.
 const arr=(db.reviews||[]).filter(r=>r.visible&&r.consent);if(!arr.length)return '';
 const cards=arr.map(r=>reviewCard(r,false)).join('');return `<section class="reviews-section"><div class="wrap"><h2>Review</h2><div class="review-viewport" id="review-viewport"><div class="review-track">${cards}${cards}${cards}</div></div></div></section>`;
}
function discountTotal(){if(GDSB_LIVE_READY)return GDSB_COUPON_RESULT?.discount||0;return 0}
function couponObj(){return GDSB_COUPON_RESULT?.couponCode?{code:GDSB_COUPON_RESULT.couponCode,active:true,scope:'all'}:null}
async function gdsbRefreshQuote(showError=false){if(!cartLines().length){GDSB_COUPON_RESULT=null;return}try{GDSB_COUPON_RESULT=await gdsbApi('quote',{method:'POST',body:JSON.stringify({items:cartLines().map(x=>({id:x.p.id,qty:x.qty})),coupon:couponApplied||''})})}catch(error){GDSB_COUPON_RESULT=null;if(showError)toast(error.message);if(couponApplied){couponApplied='';sessionStorage.removeItem('gdsb_coupon')}}render()}
applyCoupon=async function(){const value=(document.getElementById('coupon-in')?.value||'').trim().toUpperCase();couponApplied=value; if(!value){GDSB_COUPON_RESULT=null;sessionStorage.removeItem('gdsb_coupon');render();toast('Coupon cleared');return}try{
 await gdsbRefreshQuote(true);if(GDSB_COUPON_RESULT){sessionStorage.setItem('gdsb_coupon',value);toast('Coupon applied')}
 }catch(err){toast(err.message)}};
changeQty=function(id,d){GDSB_ORIGINAL.changeQty(id,d);if(couponApplied)gdsbRefreshQuote()};
removeLineItem=function(id){GDSB_ORIGINAL.removeLineItem(id);if(couponApplied)gdsbRefreshQuote()};

// Server receipt upload (private Supabase bucket), authenticated bot token and verified prices.
submitOrder=async function(e){e.preventDefault();if(!receiptData)return toast('Add your receipt first');
 const btn=e.submitter||e.target.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
 try{
  const customer=JSON.parse(sessionStorage.getItem('gdsb_customer')||'null');if(!customer)throw Error('Enter delivery information first');
  const turnstileToken=await gdsbCheckoutToken();
  const sent=await gdsbApi('orders',{method:'POST',body:JSON.stringify({reference:orderReference(),customer,items:cartLines().map(({p,qty})=>({id:p.id,qty})),coupon:couponApplied||'',receipt:receiptData,turnstileToken})});
  const result={id:sent.reference,total:sent.total,status:sent.status};sessionStorage.setItem('gdsb_last_order',sent.reference);sessionStorage.setItem('gdsb_order_result',JSON.stringify(result));
  cart={};cartSave();clearCoupon();receiptData='';sessionStorage.removeItem('gdsb_customer');sessionStorage.removeItem('gdsb_pending_order');location.href='success.html';
 }catch(err){toast(err.message);if(window.turnstile&&GDSB_TURNSTILE_ID!==null)window.turnstile.reset(GDSB_TURNSTILE_ID);if(btn)btn.disabled=false}
};
function successPage(){const o=JSON.parse(sessionStorage.getItem('gdsb_order_result')||'null');return `<main class="page wrap"><div class="card" style="max-width:640px;margin:auto;text-align:center"><h1>Order received</h1><p>Order reference: <b>${esc(o?.id||'')}</b></p><p>Your receipt is awaiting manual verification. This does not confirm that the transfer was received.</p><p>Delivery details and charges are discussed with the vendor on WhatsApp.</p><button class="btn btn-primary" onclick="wa('Hello GD Spark & Bloom, I just submitted order ${esc(o?.id||'')} for ${fmt(o?.total||0)}. Please check my payment receipt.')">Message seller</button><p><a href="index.html">Continue shopping</a></p></div></main>`}
async function gdsbCheckoutToken(){for(let i=0;i<32;i++){if(window.turnstile&&GDSB_TURNSTILE_ID!==null){const value=window.turnstile.getResponse(GDSB_TURNSTILE_ID);if(value)return value;}await new Promise(done=>setTimeout(done,500));}throw Error(`Browser verification could not complete. Try again, or contact us on WhatsApp.`)} function gdsbInsertTurnstile(){if(!GDSB_TURNSTILE_SITEKEY)return;const form=document.querySelector(`.payment-page form`);if(!form||form.querySelector(`.gdsb-captcha`))return;const box=document.createElement(`div`);box.className=`gdsb-captcha`;box.setAttribute(`aria-label`,`Checkout security`);form.appendChild(box);const note=document.createElement(`p`);note.hidden=true;note.style.cssText=`font-size:13px;line-height:1.5;color:#6c4036;margin:10px 0`;note.appendChild(document.createTextNode(`Browser verification could not complete. Try again or `));const wa=document.createElement(`a`);wa.href=`https://wa.me/`+WA;wa.textContent=`order through WhatsApp`;wa.target=`_blank`;wa.rel=`noopener noreferrer`;note.appendChild(wa);form.appendChild(note);function draw(){if(!window.turnstile)return;try{GDSB_TURNSTILE_ID=window.turnstile.render(box,{sitekey:GDSB_TURNSTILE_SITEKEY,theme:`light`,appearance:`interaction-only`,retry:`auto`,[`error-callback`]:function(code){console.warn(`GDSB checkout verification error`,code);box.dataset.failures=String(Number(box.dataset.failures||0)+1);if(Number(box.dataset.failures)<=2)return false;note.hidden=false;return true},callback:function(){note.hidden=true;}})}catch(e){console.warn(`Checkout security could not start`);note.hidden=false}}if(window.turnstile)draw();else{const s=document.createElement(`script`);s.src=`https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`;s.async=true;s.onload=draw;s.onerror=()=>{note.hidden=false};document.head.appendChild(s)}}
async function gdsbWrite(action,payload){try{await gdsbApi('admin/mutate',{method:'POST',body:JSON.stringify({action,payload})});await gdsbLoadAdmin();toast('Saved');return true}catch(error){toast(error.message);return false}}
function toggleProd(id,key){gdsbWrite('product-toggle',{id,key})}
function deleteProd(id){if(confirm('Delete this product?'))gdsbWrite('product-delete',{id})}
async function gdsbUploaded(f){if(!f||!f.size)return '';return await fileData(f)}
saveProduct=async function(e){e.preventDefault();try{
 const d=new FormData(e.target);const upload=await gdsbUploaded(d.get('imageUpload'));
 const payload={id:editing||undefined,name:d.get('name'),category:d.get('category'),description:d.get('description'),price:Number(d.get('price')),salePrice:Number(d.get('salePrice')||0),stock:d.has('stock'),bestseller:d.has('bestseller'),kit:d.has('kit'),hidden:d.has('hidden'),image:upload||d.get('image')||''};
 if(await gdsbWrite('product-save',payload))location.href='admin.html#products';
 }catch(err){toast(err.message)}};
function createCategory(e){e.preventDefault();gdsbWrite('category-add',{name:new FormData(e.target).get('category')})}
function renameCategory(old){const name=prompt('Rename category',old);if(name&&name.trim())gdsbWrite('category-rename',{old,name})}
function deleteCategory(name){if(confirm('Delete category?'))gdsbWrite('category-delete',{name})}
function toggleCouponEntry(checked){gdsbWrite('coupon-global',{enabled:checked})}
saveCoupon=function(e){e.preventDefault();const d=new FormData(e.target);gdsbWrite('coupon-create',{code:d.get('code'),type:d.get('type'),value:Number(d.get('value')),scope:d.get('scope'),productId:d.get('productId')})};
function toggleCoupon(code){gdsbWrite('coupon-toggle',{code})}
function deleteCoupon(code){if(confirm('Delete coupon?'))gdsbWrite('coupon-delete',{code})}
saveHeroBanner=async function(e){e.preventDefault();try{const d=new FormData(e.target),image=await gdsbUploaded(d.get('imageUpload'));gdsbWrite('hero-save',{title:d.get('title'),subtitle:d.get('subtitle'),image:image||d.get('image')})}catch(err){toast(err.message)}};
savePromoBanner=async function(e){e.preventDefault();try{const d=new FormData(e.target),image=await gdsbUploaded(d.get('imageUpload'));gdsbWrite('promo-save',{title:d.get('title'),subtitle:d.get('subtitle'),image:image||d.get('image'),start:d.get('start'),end:d.get('end'),active:d.has('active'),countdown:d.has('countdown')})}catch(err){toast(err.message)}};
function saveBank(e){e.preventDefault();const d=new FormData(e.target);gdsbWrite('bank-save',{name:d.get('name'),bank:d.get('bank'),number:d.get('number')})}
function saveReview(e){e.preventDefault();const d=new FormData(e.target);gdsbWrite('review-add',{author:d.get('author'),location:d.get('location'),text:d.get('text'),rating:Number(d.get('rating')),consent:d.has('consent')})}
function toggleReview(id){gdsbWrite('review-toggle',{id})}
function deleteReview(id){if(confirm('Delete review?'))gdsbWrite('review-delete',{id})}
function setOrderStatus(id,status,withWhatsapp){const target=db.orders.find(o=>o.id===id);gdsbWrite('order-status',{id,status}).then(ok=>{if(ok&&withWhatsapp&&target){const m=status==='Payment confirmed'?'confirmed':status==='Payment not confirmed'?'rejected':status==='Out for delivery'?'delivery':status==='Delivered'?'delivered':'generic';wa(orderMsg(target,m))}})}

async function gdsbBootstrap(){
 try{
  const config=await gdsbApi('config');GDSB_TURNSTILE_SITEKEY=config.turnstileSiteKey||'';GDSB_CHECKOUT_READY=!!config.checkoutReady;
  if(!config.ready){gdsbUnavailable();return}GDSB_LIVE_READY=true;
  if(GDSB_IS_ADMIN){if(GDSB_AUTH_TOKEN){try{await gdsbLoadAdmin()}catch{GDSB_AUTH_TOKEN='';sessionStorage.removeItem('gdsb_admin_token');render()}}else render();return}
  const d=await gdsbApi('catalog');Object.assign(db,d);db.orders=[];db.coupons=[];db.reviews=d.reviews||[];
  if(couponApplied)await gdsbRefreshQuote();else render();
 }catch(e){gdsbUnavailable('We are setting up the online store. Please order or enquire via WhatsApp.');console.warn('Backend not ready')}
}
// Keep current GitHub Pages version untouched; V15 only runs live against configured Vercel APIs.
gdsbBootstrap();

function retryOrderEmail(id){if(confirm('Resend new-order notification to the admin inbox?'))gdsbWrite('order-retry-email',{id})}
