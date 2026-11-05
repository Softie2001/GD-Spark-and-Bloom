import {configured,checkAdmin,method,fail,onError,rows,receiptUrl} from '../../lib/server.js';
import {settings,cleanSettings,cleanProduct,cleanCoupon,cleanOrder} from '../../lib/shop.js';
export default async function handler(req,res){if(method(req,res,['GET']))return;if(!configured())return fail(res,503,'Admin setup in progress');try{
 await checkAdmin(req);
 const [p,c,coupons,orders,reviews,s]=await Promise.all([
 rows('gdsb_products','select=*&order=created_at.desc'),rows('gdsb_categories','select=*&order=sort_order.asc'),rows('gdsb_coupons','select=*&order=created_at.desc'),rows('gdsb_orders','select=*,gdsb_order_items(*)&order=submitted_at.desc&limit=200'),rows('gdsb_reviews','select=*&order=created_at.desc'),settings()]);
 const fullOrders=await Promise.all(orders.map(async o=>({...cleanOrder(o),receipt:await receiptUrl(o.receipt_path).catch(()=>null)})));
 res.setHeader('Cache-Control','no-store');return res.status(200).json({products:p.map(cleanProduct),categories:c.map(x=>x.name),coupons:coupons.map(cleanCoupon),orders:fullOrders,reviews:reviews.map(r=>({id:r.id,author:r.author,location:r.location,text:r.message,rating:r.stars,consent:r.consent,visible:r.visible})),...cleanSettings(s)})
 }catch(err){return onError(res,err)}}
