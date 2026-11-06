/* GD Spark & Bloom — Vercel/Supabase connection layer.
   Runs only after site.js and never exposes the server secret or Resend key. */
'use strict';
let GDSB_LIVE_READY=false, GDSB_CHECKOUT_READY=false, GDSB_ADMIN_OK=false, GDSB_AUTH_TOKEN=sessionStorage.getItem('gdsb_admin_token')||'', GDSB_COUPON_RESULT=null;
let GDSB_ORDER_SUBMITTING=false;
const GDSB_IS_ADMIN=['admin','admin-product'].includes(page);
const GDSB_ORIGINAL={render,submitOrder,applyCoupon,changeQty,removeLineItem,saveProduct,saveHeroBanner,savePromoBanner,saveCoupon,saveBank,saveReview};
async function gdsbApi(path,options={}){
 const headers={'Content-Type':'application/json',...(GDSB_AUTH_TOKEN?{'Authorization':'Bearer '+GDSB_AUTH_TOKEN}:{})};
 const r=await fetch('/api/'+path,{...options,headers:{...headers,...options.headers},cache:'no-store'});
 const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.error||'Request failed');return result;
}
function gdsbUnavailable(message='Store setup is in progress. Please contact the vendor on WhatsApp.'){
 document.getElementById('app').innerHTML=`<div class="gdsb-maintenance"><img src="assets/gdsb-logo.png" alt="GD Spark & Bloom" width="76" height="76"><h1>GD Spark & Bloom</h1><p>${esc(message)}</p><a class="btn btn-primary" href="https://wa.me/${WA}">Chat on WhatsApp</a></div>`;
}
function gdsbAdminLogin(){return `<div class="gdsb-admin-login"><img src="assets/gdsb-logo.png" alt="GD Spark & Bloom" width="70" height="70"><h1>Admin sign in</h1><p>Only authorised store administrators can manage orders, receipts and products.</p><form onsubmit="gdsbSignIn(event)"><div class="form-field"><label>Email</label><input name="email" type="email" autocomplete="username" required></div><div class="form-field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn btn-primary" type="submit">Sign in</button></form><p id="gdsb-login-message" role="status"></p><a href="index.html">Back to shop</a></div>`}
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
 initGdsbReviewSlideshow();

 if(GDSB_IS_ADMIN){const logout=document.createElement('button');logout.className='sidebtn';logout.innerHTML=icon('logout')+' Sign out';logout.onclick=gdsbSignOut;document.querySelector('.admin-side')?.append(logout)}
}
function reviewsSection(){
  // Only published reviews are shown. Duplicates at both ends make the slide wrap seamlessly.
  const published=(db.reviews||[]).filter(r=>r.visible&&r.consent);
  if(!published.length)return '';
  const slides=[published[published.length-1],...published,published[0]];
  const cards=slides.map((review,index)=>{
    const markup=reviewCard(review,false);
    return (index===0||index===slides.length-1)
      ? markup.replace('<article ','<article aria-hidden="true" ')
      : markup;
  }).join('');
  return `<section class="reviews-section gdsb-review-slideshow" aria-labelledby="reviews-heading">
    <div class="review-heading"><h2 id="reviews-heading">Review</h2></div>
    <div class="gdsb-review-slide-viewport" id="gdsb-review-slideshow" data-count="${published.length}" role="region" aria-roledescription="slideshow" aria-label="Customer reviews">
      <div class="gdsb-review-slide-track">${cards}</div>
    </div>
  </section>`;
}
let gdsbSlideshowTimer=0;
let gdsbSlideshowDispose=()=>{};
function initGdsbReviewSlideshow(){
  if(gdsbSlideshowTimer){clearInterval(gdsbSlideshowTimer);gdsbSlideshowTimer=0;}
  gdsbSlideshowDispose();gdsbSlideshowDispose=()=>{};
  const viewport=document.getElementById('gdsb-review-slideshow');if(!viewport)return;
  const track=viewport.querySelector('.gdsb-review-slide-track');
  const total=Number(viewport.dataset.count)||0;
  if(!track||total<1)return;
  const reduced=!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let index=1,moving=false,down=null,resetFallback=0;
  const width=()=>viewport.getBoundingClientRect().width||viewport.clientWidth||0;
  function paint(animated){
    const w=width();if(!w)return;
    track.style.transition=animated?'transform 600ms cubic-bezier(.22,.61,.36,1)':'none';
    track.style.transform='translate3d('+(-index*w)+'px,0,0)';
  }
  function finish(){
    if(resetFallback){clearTimeout(resetFallback);resetFallback=0;}
    if(index===total+1){index=1;paint(false);}
    else if(index===0){index=total;paint(false);}
    moving=false;
  }
  function change(direction){
    if(moving||document.hidden)return;
    moving=true;index+=direction;paint(!reduced);
    if(reduced)finish();
    else resetFallback=setTimeout(finish,720);
  }
  function onEnd(event){if(event.target===track&&event.propertyName==='transform')finish();}
  function onDown(event){if(event.button!==undefined&&event.button!==0)return;down={x:event.clientX,y:event.clientY};}
  function onUp(event){
    if(!down)return;
    const dx=event.clientX-down.x,dy=event.clientY-down.y;
    down=null;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))change(dx<0?1:-1);
  }
  function onCancel(){down=null;}
  function onResize(){paint(false);}
  track.addEventListener('transitionend',onEnd);
  viewport.addEventListener('pointerdown',onDown);
  viewport.addEventListener('pointerup',onUp);
  viewport.addEventListener('pointercancel',onCancel);
  window.addEventListener('resize',onResize);
  paint(false);
  if(!reduced)gdsbSlideshowTimer=setInterval(()=>{if(!down)change(1);},4200);
  gdsbSlideshowDispose=()=>{
    track.removeEventListener('transitionend',onEnd);
    viewport.removeEventListener('pointerdown',onDown);
    viewport.removeEventListener('pointerup',onUp);
    viewport.removeEventListener('pointercancel',onCancel);
    window.removeEventListener('resize',onResize);
    if(resetFallback)clearTimeout(resetFallback);
  };
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
submitOrder=async function(e){e.preventDefault();if(GDSB_ORDER_SUBMITTING)return;if(!receiptData)return toast('Add your receipt first');GDSB_ORDER_SUBMITTING=true;
 const btn=e.submitter||document.querySelector('button[form="payment-form"][type="submit"]');if(btn)btn.disabled=true;
 try{
  const customer=JSON.parse(sessionStorage.getItem('gdsb_customer')||'null');if(!customer)throw Error('Enter delivery information first');
  const sent=await gdsbApi('orders',{method:'POST',body:JSON.stringify({reference:orderReference(),customer,items:cartLines().map(({p,qty})=>({id:p.id,qty})),coupon:couponApplied||'',receipt:receiptData,website:e.target.elements?.namedItem('website')?.value||''})});
  const result={id:sent.reference,total:sent.total,status:sent.status};sessionStorage.setItem('gdsb_last_order',sent.reference);sessionStorage.setItem('gdsb_order_result',JSON.stringify(result));
  cart={};cartSave();clearCoupon();receiptData='';sessionStorage.removeItem('gdsb_customer');sessionStorage.removeItem('gdsb_pending_order');try{gdsbShowOrderSuccess(result)}catch(uiError){console.error('Order saved, confirmation display failed',uiError);location.href='success.html'}
 }catch(err){GDSB_ORDER_SUBMITTING=false;toast(err.message);if(btn)btn.disabled=false;
  const feedback=document.getElementById('receipt-feedback');
  if(feedback&&/stock|available|price changed/i.test(err.message)){feedback.textContent=err.message;feedback.setAttribute('role','alert')}
 }
};

// The order has already been saved by /api/orders. This sheet confirms receipt
// without another request or navigation; dismissing it returns to the shop.
function gdsbShowOrderSuccess(order){
  if(!order||!/^GD-[A-Z0-9-]{8,48}$/.test(order.id))throw Error('Invalid order reference');
  document.querySelector('.gdsb-order-confirm-overlay')?.remove();
  document.querySelector('.checkout-action-bar')?.remove();
  const sheet=document.createElement('div');
  sheet.className='gdsb-order-confirm-overlay';
  sheet.innerHTML=`<section class="gdsb-order-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="gdsb-order-confirm-title">
    <span class="gdsb-order-confirm-handle" aria-hidden="true"></span>
    <div class="gdsb-order-confirm-header"><span>Order submitted</span><button type="button" class="gdsb-order-confirm-close" onclick="gdsbCloseOrderSuccess()" aria-label="Close confirmation">&times;</button></div>
    <div class="gdsb-order-confirm-body">
      <div class="gdsb-order-confirm-check" aria-hidden="true">${icon('check')}</div>
      <h2 id="gdsb-order-confirm-title">Thank you for your order!</h2>
      <p>We received your order and receipt. Payment is awaiting verification.</p>
      <div class="gdsb-order-confirm-reference"><div><small>Your order number</small><strong>${esc(order.id)}</strong></div><button type="button" data-order="${esc(order.id)}" onclick="gdsbCopyOrderNumber(this)" aria-label="Copy order number">${icon('copy')} <span>Copy</span></button></div>
      <p class="gdsb-order-confirm-next">We will update you on WhatsApp after verification.</p>
      <button type="button" class="gdsb-order-confirm-done" onclick="gdsbCloseOrderSuccess()">Continue shopping</button>
    </div>
  </section>`;
  document.body.appendChild(sheet);
  document.body.classList.add('gdsb-order-confirm-open');
  sheet.querySelector('.gdsb-order-confirm-close')?.focus({preventScroll:true});
}
async function gdsbCopyOrderNumber(button){
  try{await navigator.clipboard.writeText(button.dataset.order);const span=button.querySelector('span');if(span){span.textContent='Copied';setTimeout(()=>{if(span.isConnected)span.textContent='Copy'},1700)}}
  catch{toast('Please copy the order number manually')}
}
function gdsbCloseOrderSuccess(){
  document.body.classList.remove('gdsb-order-confirm-open');
  location.href='index.html';
}

function successPage(){const o=JSON.parse(sessionStorage.getItem('gdsb_order_result')||'null');return `<main class="page wrap"><div class="card" style="max-width:640px;margin:auto;text-align:center"><h1>Order received</h1><p>Order reference: <b>${esc(o?.id||'')}</b></p><p>Your receipt is awaiting manual verification. This does not confirm that the transfer was received.</p><p>Delivery details and charges are discussed with the vendor on WhatsApp.</p><button class="btn btn-primary" onclick="wa('Hello GD Spark & Bloom, I just submitted order ${esc(o?.id||'')} for ${fmt(o?.total||0)}. Please check my payment receipt.')">Message seller</button><p><a href="index.html">Continue shopping</a></p></div></main>`}
async function gdsbWrite(action,payload){try{await gdsbApi('admin/mutate',{method:'POST',body:JSON.stringify({action,payload})});await gdsbLoadAdmin();toast('Saved');return true}catch(error){toast(error.message);return false}}
function toggleProd(id,key){gdsbWrite('product-toggle',{id,key})}
function deleteProd(id){if(confirm('Delete this product?'))gdsbWrite('product-delete',{id})}
// Only signed-in store admins may request an upload signature. Images bypass the
// 4.5 MB Vercel request cap by uploading directly to the existing Cloudinary account.
async function gdsbUploaded(f){
 if(!f||!f.size)return '';
 const allowed=['image/png','image/jpeg','image/webp'];
 const maxBytes=5*1024*1024;
 if(!allowed.includes(f.type))throw Error('Select a JPG, PNG or WebP image');
 if(f.size>maxBytes)throw Error('Image must be 5 MB or smaller');
 const ticket=await gdsbApi('admin/upload-signature',{method:'POST'});
 if(ticket.maxBytes!==maxBytes||!ticket.cloud||!ticket.apiKey||!ticket.signature)throw Error('Image upload is not configured');
 const form=new FormData();
 form.append('file',f);
 form.append('api_key',ticket.apiKey);
 form.append('folder',ticket.folder);
 form.append('public_id',ticket.publicId);
 form.append('timestamp',String(ticket.timestamp));
 form.append('signature',ticket.signature);
 const response=await fetch('https://api.cloudinary.com/v1_1/'+encodeURIComponent(ticket.cloud)+'/image/upload',{method:'POST',body:form});
 const asset=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(asset.error?.message||'Image upload failed. Please retry');
 if(asset.resource_type!=='image'||!['jpg','jpeg','png','webp'].includes(asset.format)||
    !Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>maxBytes||
    typeof asset.public_id!=='string'||!asset.public_id.startsWith(ticket.folder+'/')||
    typeof asset.secure_url!=='string'||!asset.secure_url.startsWith('https://res.cloudinary.com/'+ticket.cloud+'/image/upload/'))
    throw Error('Image storage returned an invalid image');
 return asset.secure_url;
}
saveProduct=async function(e){e.preventDefault();try{
 const d=new FormData(e.target);const upload=await gdsbUploaded(d.get('imageUpload'));
 const payload={id:editing||undefined,name:d.get('name'),category:d.get('category'),description:d.get('description'),price:Number(d.get('price')),salePrice:Number(d.get('salePrice')||0),availableQuantity:Number(d.get('availableQuantity')),stock:d.has('stock'),bestseller:d.has('bestseller'),kit:d.has('kit'),hidden:d.has('hidden'),image:upload||d.get('image')||''};
 if(await gdsbWrite('product-save',payload))location.href='/admin#products';
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
  const config=await gdsbApi('config');GDSB_CHECKOUT_READY=!!config.checkoutReady;
  if(!config.ready){gdsbUnavailable();return}GDSB_LIVE_READY=true;
  if(GDSB_IS_ADMIN){if(GDSB_AUTH_TOKEN){try{await gdsbLoadAdmin()}catch{GDSB_AUTH_TOKEN='';sessionStorage.removeItem('gdsb_admin_token');render()}}else render();return}
  const d=await gdsbApi('catalog');Object.assign(db,d);db.orders=[];db.coupons=[];db.reviews=d.reviews||[];
  if(couponApplied)await gdsbRefreshQuote();else render();
 }catch(e){gdsbUnavailable('We are setting up the online store. Please order or enquire via WhatsApp.');console.warn('Backend not ready')}
}
// Keep current GitHub Pages version untouched; V15 only runs live against configured Vercel APIs.
gdsbBootstrap();

function retryOrderEmail(id){if(confirm('Resend new-order notification to the admin inbox?'))gdsbWrite('order-retry-email',{id})}
