import {rows,required,money,q} from './server.js';

export const cleanProduct=p=>({
 id:p.id,name:p.name,category:p.category,description:p.description||'',
 price:p.price,salePrice:p.sale_price||0,stock:p.in_stock,bestseller:p.best_seller,
 hidden:p.hidden,kit:p.is_kit,image:p.image_url||''
});
export const cleanCoupon=c=>({code:c.code,type:c.discount_type,value:c.value,scope:c.scope,productId:c.product_id,active:c.enabled});
export const cleanOrder=o=>({
 id:o.reference,dbId:o.id,customer:{name:o.customer_name,phone:o.whatsapp,state:o.delivery_state,city:o.city,address:o.delivery_address,note:o.note},
 items:(o.gdsb_order_items||[]).map(i=>({id:i.product_id,name:i.product_name,qty:i.quantity,unit:i.unit_price})),
 subtotal:o.subtotal,discount:o.discount,total:o.total,coupon:o.coupon_code||'',status:o.status,createdAt:o.submitted_at,receiptPath:o.receipt_path,notificationError:o.notification_error||null,notificationSentAt:o.notification_sent_at||null
});
export const cleanSettings=s=>({
 bank:{bank:s.bank_name,name:s.account_name,number:s.account_number},
 couponEntryEnabled:s.coupon_entry_enabled,
 heroBanner:{title:s.hero_title,subtitle:s.hero_subtitle,image:s.hero_image},
 promoBanner:{title:s.promo_title,subtitle:s.promo_subtitle,image:s.promo_image,start:s.promo_starts_at,end:s.promo_ends_at,active:s.promo_enabled,countdown:s.promo_countdown}
});
export async function settings(){const list=await rows('gdsb_settings','select=*&id=eq.1&limit=1');if(!list.length)throw new Error('Store is not configured');return list[0]}
export async function quote(input){
 const arr=Array.isArray(input.items)?input.items:[];
 if(!arr.length||arr.length>40)throw Object.assign(new Error('Choose between 1 and 40 products'),{status:400});
 const combined=new Map();for(const x of arr){const id=String(x.id||'');const qty=Number(x.qty);if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!Number.isInteger(qty)||qty<1||qty>100)throw Object.assign(new Error('Invalid product or quantity'),{status:400});combined.set(id,(combined.get(id)||0)+qty)}
 for(const n of combined.values())if(n>100)throw Object.assign(new Error('Quantity limit exceeded'),{status:400});
 const ids=[...combined.keys()];const products=await rows('gdsb_products','select=id,name,price,sale_price,in_stock,hidden');
 const productMap=new Map(products.map(p=>[p.id,p]));let subtotal=0;const lines=[];
 for(const id of ids){const p=productMap.get(id);if(!p||p.hidden||!p.in_stock)throw Object.assign(new Error('A product is unavailable. Please update your cart.'),{status:409});const qty=combined.get(id),unit=p.sale_price!==null&&p.sale_price>=0&&p.sale_price<p.price?p.sale_price:p.price;subtotal+=unit*qty;lines.push({id,name:p.name,qty,unit,lineTotal:qty*unit})}
 if(subtotal>200000000)throw Object.assign(new Error('Order exceeds supported amount'),{status:400});
 const s=await settings();let discount=0,couponCode='';const code=String(input.coupon||'').trim().toUpperCase();
 if(code&&s.coupon_entry_enabled){if(!/^[A-Z0-9_-]{3,32}$/.test(code))throw Object.assign(new Error('Invalid coupon'),{status:400});const matches=await rows('gdsb_coupons',`select=*&code=eq.${q(code)}&enabled=eq.true&limit=1`);const coupon=matches[0];if(!coupon)throw Object.assign(new Error('This coupon is invalid or inactive'),{status:400});const eligible=coupon.scope==='product'?lines.filter(l=>l.id===coupon.product_id).reduce((a,l)=>a+l.lineTotal,0):subtotal;if(eligible===0)throw Object.assign(new Error('This coupon does not apply to your items'),{status:400});discount=Math.min(eligible,coupon.discount_type==='percent'?Math.round(eligible*coupon.value/100):coupon.value);couponCode=code}
 else if(code)throw Object.assign(new Error('Coupons are not currently enabled'),{status:400});
 return {lines,subtotal,discount,total:subtotal-discount,couponCode};
}
