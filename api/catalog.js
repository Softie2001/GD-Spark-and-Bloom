import {configured,method,onError,fail,rows} from '../lib/server.js';
import {settings,cleanProduct,cleanSettings} from '../lib/shop.js';
export default async function handler(req,res){if(method(req,res,['GET']))return;if(!configured())return fail(res,503,'Store setup in progress');try{
 const [p,c,s,r]=await Promise.all([rows('gdsb_products','select=*&hidden=eq.false&order=created_at.desc'),rows('gdsb_categories','select=*&order=sort_order.asc'),settings(),rows('gdsb_reviews','select=*&visible=eq.true&consent=eq.true&order=created_at.desc&limit=30')]);
 res.setHeader('Cache-Control',s.inventory_enabled!==false?'no-store':'public, s-maxage=10, stale-while-revalidate=10');return res.status(200).json({products:p.map(x=>cleanProduct(x,s.inventory_enabled!==false)),categories:c.map(x=>x.name),reviews:r.map(x=>({id:x.id,author:x.author,location:x.location,text:x.message,rating:x.stars,consent:true,visible:true})),...cleanSettings(s),coupons:[],orders:[]})
 }catch(err){return onError(res,err)}}
