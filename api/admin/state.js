import {configured,checkAdmin,method,fail,onError,rows,receiptUrl} from '../../lib/server.js';
import {settings,cleanSettings,cleanProduct,cleanCoupon,cleanOrder,cleanPromotion} from '../../lib/shop.js';
export default async function handler(req,res){if(method(req,res,['GET']))return;if(!configured())return fail(res,503,'Admin setup in progress');try{
 await checkAdmin(req);
 const [p,c,coupons,orders,reviews,s,promotions]=await Promise.all([
 rows('gdsb_products','select=*&order=created_at.desc'),rows('gdsb_categories','select=*&order=sort_order.asc'),rows('gdsb_coupons','select=*&order=created_at.desc'),rows('gdsb_orders','select=*,gdsb_order_items(*)&order=submitted_at.desc&limit=200'),rows('gdsb_reviews','select=*&order=created_at.desc'),settings(),rows('gdsb_promotions','select=*&order=created_at.desc&limit=100')]);
 const fullOrders=await Promise.all(orders.map(async o=>({...cleanOrder(o),receipt:await receiptUrl(o.receipt_path).catch(()=>null)})));
 res.setHeader('Cache-Control','no-store');return res.status(200).json({products:p.map(x=>cleanProduct(x,s.inventory_enabled!==false)),categories:c.map(x=>x.name),coupons:coupons.map(cleanCoupon),orders:fullOrders,promotions:promotions.map(cleanPromotion),reviews:reviews.map(r=>({id:r.id,author:r.author,location:r.location,text:r.message,rating:r.stars,consent:r.consent,visible:r.visible})),...cleanSettings(s)})
 }catch(err){return onError(res,err)}}
