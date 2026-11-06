import {configured,body,method,onError,fail,required,tidy,checkPhone,decodeImage,uploadImage,newOrderRef,supa,patch,q,sendAdminMail,deleteReceipt} from '../lib/server.js';
import {quote,settings} from '../lib/shop.js';
import {randomUUID} from 'node:crypto';

export default async function handler(req,res){if(method(req,res,['POST']))return;if(!configured())return fail(res,503,'Store setup in progress');
 let receiptPath,orderId;
 try{
  const d=body(req);if(typeof d.website==='string'&&d.website.trim())return fail(res,400,'Order could not be submitted. Please try again.');
  const customer=d.customer||{};
  const c={customer_name:required(customer.name,'Name',100),whatsapp:checkPhone(customer.phone),delivery_state:required(customer.state,'State',70),city:required(customer.city,'City',90),delivery_address:required(customer.address,'Delivery address',250),note:tidy(customer.note,500)};
  // All prices and discount eligibility are recalculated on the server, never trusted from the browser.
  const s=await settings();if(!/^\d{10}$/.test(s.account_number)||!s.account_name||!s.bank_name)return fail(res,503,'Bank transfer details are not ready. Do not transfer money.');
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM||!process.env.ADMIN_NOTIFY_EMAIL||!/^https:\/\//.test(process.env.SITE_ORIGIN||''))return fail(res,503,'Order notifications are not configured yet');
  const pricing=await quote(d);
  const receipt=decodeImage(d.receipt);
  const ref=typeof d.reference==='string'&&/^GD-[A-Z0-9-]{8,48}$/.test(d.reference)?d.reference:newOrderRef();
  receiptPath=`${new Date().toISOString().slice(0,10)}/${randomUUID()}.${receipt.ext}`;
  await uploadImage('gdsb-receipts',receiptPath,d.receipt);
  // One database transaction locks stock rows, reserves quantities, and inserts
  // the order + items together. A concurrent checkout cannot oversell stock.
  try {
   orderId=await supa('/rest/v1/rpc/gdsb_place_order',{method:'POST',data:{
    p_order:{...c,reference:ref,subtotal:pricing.subtotal,discount:pricing.discount,total:pricing.total,coupon_code:pricing.couponCode||null,receipt_path:receiptPath},
    p_lines:pricing.lines.map(({id,name,qty,unit,lineTotal})=>({id,name,qty,unit,line_total:lineTotal}))
   }});
  }catch(error){
   const reason=error?.info?.message;
   if(['INSUFFICIENT_STOCK','STOCK_UNAVAILABLE'].includes(reason))
    throw Object.assign(new Error('Stock changed during checkout. If you already transferred money, contact the store on WhatsApp with your transfer reference before paying again.'),{status:409});
   if(reason==='PRICE_CHANGED')
    throw Object.assign(new Error('A product price changed. Please refresh the shop and try again.'),{status:409});
   throw error;
  }
  if(typeof orderId!=='string'||!orderId)throw new Error('Could not record order');
  const notify=await sendAdminMail({...c,reference:ref,total:pricing.total}).catch(()=>({sent:false,error:'Email service unavailable'}));
  await patch('gdsb_orders',`id=eq.${q(orderId)}`,{notification_sent_at:notify.sent?new Date().toISOString():null,notification_error:notify.sent?null:notify.error}).catch(()=>{});
  res.setHeader('Cache-Control','no-store');return res.status(201).json({reference:ref,total:pricing.total,status:'Pending verification',notificationSent:notify.sent});
 }catch(err){
  if(receiptPath)await deleteReceipt(receiptPath)
  return onError(res,err)
 }
}
