import {randomUUID} from 'node:crypto';
import {configured,checkAdmin,body,method,fail,onError,tidy,required,money,add,patch,rows,remove,q,uploadCloudinary,verifiedCloudinaryUrl,sendAdminMail} from '../../lib/server.js';
const invalid=(m)=>{throw Object.assign(new Error(m),{status:400})};
async function picture(value,existing=''){
 if(!value)return existing;
 if(String(value).startsWith('data:'))return await uploadCloudinary(value);
 return verifiedCloudinaryUrl(value);
}
async function category(name){if(!name)invalid('Category is required');const existing=await rows('gdsb_categories',`select=name&name=eq.${q(name)}&limit=1`);if(!existing.length)await add('gdsb_categories',{name})}
export default async function handler(req,res){if(method(req,res,['POST']))return;if(!configured())return fail(res,503,'Admin setup in progress');try{
 await checkAdmin(req);const {action,payload={}}=body(req);if(!payload||typeof payload!=='object'||Array.isArray(payload))invalid('Invalid update');let result=null;
 switch(action){
 case 'product-save':{
  const id=tidy(payload.id,80)||'p'+randomUUID().replace(/-/g,'');if(!/^[a-zA-Z0-9_-]+$/.test(id))invalid('Invalid product ID');
  const name=required(payload.name,'Product name',150),cat=required(payload.category,'Category',60);
  const price=money(payload.price),sale=payload.salePrice===null||payload.salePrice===0||payload.salePrice===''?null:money(payload.salePrice);
  if(price===null||price>100000000||sale!==null&&(sale===null||sale>=price))invalid('Check product prices');
  const existing=await rows('gdsb_products',`select=id,image_url&id=eq.${q(id)}&limit=1`);
  await category(cat);
  const image=await picture(payload.image,existing[0]?.image_url||'');
  const record={id,name,category:cat,description:tidy(payload.description,500),price,sale_price:sale,in_stock:!!payload.stock,best_seller:!!payload.bestseller,is_kit:!!payload.kit,hidden:!!payload.hidden,image_url:image,updated_at:new Date().toISOString()};
  if(existing.length)await patch('gdsb_products',`id=eq.${q(id)}`,record);else await add('gdsb_products',record);
  result={id};break;
 }
 case 'product-toggle':{
  const key=String(payload.key),allowed={stock:'in_stock',bestseller:'best_seller',kit:'is_kit',hidden:'hidden'};if(!allowed[key])invalid('Invalid product property');const id=required(payload.id,'Product ID',80);
  const found=await rows('gdsb_products',`select=*&id=eq.${q(id)}&limit=1`);if(!found.length)invalid('Product not found');
  const col=allowed[key];await patch('gdsb_products',`id=eq.${q(id)}`,{[col]:!found[0][col],updated_at:new Date().toISOString()});break;
 }
 case 'product-delete':{
  const id=required(payload.id,'Product ID',80);await remove('gdsb_products',`id=eq.${q(id)}`);break;
 }
 case 'category-add':{const name=required(payload.name,'Category name',60);await category(name);break}
 case 'category-rename':{
  const old=required(payload.old,'Previous name',60),name=required(payload.name,'New name',60);await patch('gdsb_categories',`name=eq.${q(old)}`,{name});break
 }
 case 'category-delete':{
  const name=required(payload.name,'Category name',60);const products=await rows('gdsb_products',`select=id&category=eq.${q(name)}&limit=1`);if(products.length)invalid('Reassign category products first');await remove('gdsb_categories',`name=eq.${q(name)}`);break
 }
 case 'coupon-global':{
  await patch('gdsb_settings','id=eq.1',{coupon_entry_enabled:!!payload.enabled,updated_at:new Date().toISOString()});break
 }
 case 'coupon-create':{
  const code=required(payload.code,'Coupon code',32).toUpperCase();if(!/^[A-Z0-9_-]{3,32}$/.test(code))invalid('Coupon code must contain 3–32 letters or numbers');
  const discount_type=String(payload.type),scope=String(payload.scope),value=money(payload.value);
  if(!['percent','fixed'].includes(discount_type)||!['all','product'].includes(scope)||!value||(discount_type==='percent'&&value>100))invalid('Invalid discount');
  const product_id=scope==='product'?required(payload.productId,'Eligible product',80):null;
  await add('gdsb_coupons',{code,discount_type,value,scope,product_id,enabled:true});break
 }
 case 'coupon-toggle':{
  const code=required(payload.code,'Coupon code',32);const items=await rows('gdsb_coupons',`select=*&code=eq.${q(code)}&limit=1`);if(!items.length)invalid('Coupon not found');await patch('gdsb_coupons',`code=eq.${q(code)}`,{enabled:!items[0].enabled});break
 }
 case 'coupon-delete':{await remove('gdsb_coupons',`code=eq.${q(required(payload.code,'Code',32))}`);break}
 case 'hero-save':{
  const existing=await rows('gdsb_settings','select=hero_image&id=eq.1');const url=await picture(payload.image,existing[0]?.hero_image||'assets/hero-full.jpg');
  await patch('gdsb_settings','id=eq.1',{hero_title:required(payload.title,'Hero title',90),hero_subtitle:tidy(payload.subtitle,160),hero_image:url,updated_at:new Date().toISOString()});break
 }
 case 'promo-save':{
  const active=!!payload.active,start=payload.start||null,end=payload.end||null;
  if(active&&(!end||isNaN(new Date(end))))invalid('Choose a valid end date');if(active&&new Date(end)<=new Date())invalid('Promotion must end in the future');if(start&&end&&new Date(end)<=new Date(start))invalid('End must follow start');
  const existing=await rows('gdsb_settings','select=promo_image&id=eq.1');const image=await picture(payload.image,existing[0]?.promo_image||'');
  await patch('gdsb_settings','id=eq.1',{promo_title:required(payload.title,'Promotion title',90),promo_subtitle:tidy(payload.subtitle,160),promo_image:image,promo_starts_at:start?new Date(start).toISOString():null,promo_ends_at:end?new Date(end).toISOString():null,promo_enabled:active,promo_countdown:!!payload.countdown,updated_at:new Date().toISOString()});break
 }
 case 'bank-save':{
  const bank_name=required(payload.bank,'Bank name',100),account_name=required(payload.name,'Account name',120),account_number=required(payload.number,'Account number',10);
  if(!/^\d{10}$/.test(account_number))invalid('Enter a valid 10-digit account number');
  await patch('gdsb_settings','id=eq.1',{bank_name,account_name,account_number,updated_at:new Date().toISOString()});break
 }
 case 'review-add':{
  if(!payload.consent)invalid('Customer permission is required');
  const stars=Math.max(1,Math.min(5,Number(payload.rating)||5));await add('gdsb_reviews',{author:required(payload.author,'Reviewer',100),location:tidy(payload.location,80),message:required(payload.text,'Review',700),stars,visible:true,consent:true});break
 }
 case 'review-toggle':{
  const id=required(payload.id,'Review ID',60),found=await rows('gdsb_reviews',`select=*&id=eq.${q(id)}&limit=1`);if(!found.length)invalid('Review not found');await patch('gdsb_reviews',`id=eq.${q(id)}`,{visible:!found[0].visible});break
 }
 case 'review-delete':{await remove('gdsb_reviews',`id=eq.${q(required(payload.id,'Review ID',60))}`);break}
 case 'order-retry-email':{
  const ref=required(payload.id,'Order reference',55);
  const existing=await rows('gdsb_orders',`select=*&reference=eq.${q(ref)}&limit=1`);
  if(!existing.length)invalid('Order not found');
  const o=existing[0];
  const notify=await sendAdminMail({reference:o.reference,customer_name:o.customer_name,whatsapp:o.whatsapp,total:o.total})
    .catch(()=>({sent:false,error:'Email service unavailable'}));
  await patch('gdsb_orders',`reference=eq.${q(ref)}`,{
   notification_sent_at:notify.sent?new Date().toISOString():null,
   notification_error:notify.sent?null:notify.error
  });
  result={notificationSent:notify.sent};break;
 }
 case 'order-status':{
  const id=required(payload.id,'Order reference',55),status=String(payload.status);
  const valid=['Pending verification','Payment confirmed','Payment not confirmed','Preparing order','Out for delivery','Delivered','Cancelled'];if(!valid.includes(status))invalid('Unknown status');
  const old=await rows('gdsb_orders',`select=id,status,payment_confirmed_at&reference=eq.${q(id)}&limit=1`);if(!old.length)invalid('Order not found');
  const update={status,updated_at:new Date().toISOString()};
  if(status==='Payment confirmed'&&!old[0].payment_confirmed_at)update.payment_confirmed_at=new Date().toISOString();
  if(['Payment not confirmed','Pending verification','Cancelled'].includes(status))update.payment_confirmed_at=null;
  await patch('gdsb_orders',`reference=eq.${q(id)}`,update);break
 }
 default:invalid('Unsupported admin action');
 }
 res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,result});
 }catch(err){return onError(res,err)}}
