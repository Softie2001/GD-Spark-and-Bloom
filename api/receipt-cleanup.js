// GD Spark & Bloom: private 20-day receipt retention. Never deletes an order.
import {configured,method,fail,rows,patch,q,clientHeaders} from '../lib/server.js';

const eligible=new Set(['Payment confirmed','Preparing order','Out for delivery','Delivered']);
const safePath=/^\d{4}-\d{2}-\d{2}\/[0-9a-fA-F-]{36}\.(?:jpg|png|webp)$/;

export default async function handler(req,res){
  if(method(req,res,['GET']))return;
  res.setHeader('Cache-Control','no-store');
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({error:'Unauthorized'});
  if(!configured())return fail(res,503,'Store configuration unavailable');
  const cutoff=new Date(Date.now()-20*24*60*60*1000).toISOString();
  let checked=0,deleted=0,failed=0;
  try{
    const statuses=encodeURIComponent('"Payment confirmed","Preparing order","Out for delivery","Delivered"');
    const due=await rows('gdsb_orders',`select=id,receipt_path,status,payment_confirmed_at&payment_confirmed_at=lte.${q(cutoff)}&receipt_deleted_at=is.null&status=in.(${statuses})&order=payment_confirmed_at.asc&limit=25`);
    for(const candidate of due){
      checked++;
      if(!eligible.has(candidate.status)||!safePath.test(candidate.receipt_path)){
        failed++;console.error('Skipping unsafe receipt path or status');continue;
      }
      try{
        // Double-check before deletion: confirmation must still be valid.
        const current=await rows('gdsb_orders',`select=id,receipt_path,status,payment_confirmed_at,receipt_deleted_at&id=eq.${q(candidate.id)}&limit=1`);
        const order=current[0];
        if(!order||!eligible.has(order.status)||order.receipt_path!==candidate.receipt_path||order.receipt_deleted_at||!order.payment_confirmed_at||Date.parse(order.payment_confirmed_at)>Date.parse(cutoff))continue;
        const path=order.receipt_path.split('/').map(encodeURIComponent).join('/');
        // Supabase Storage API deletes actual bytes. SQL row deletion would orphan files.
        const result=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/storage/v1/object/gdsb-receipts/${path}`,{
          method:'DELETE',headers:clientHeaders(true)
        });
        if(!result.ok&&result.status!==404)throw Error(`Storage returned HTTP ${result.status}`);
        // Keep the order, products, customer, status and totals. Remove only receipt metadata.
        const now=new Date().toISOString();
        const updated=await patch('gdsb_orders',`id=eq.${q(order.id)}&receipt_path=eq.${q(order.receipt_path)}&receipt_deleted_at=is.null&payment_confirmed_at=lte.${q(cutoff)}`,{
          receipt_path:'',receipt_deleted_at:now,updated_at:now
        });
        if(!Array.isArray(updated)||updated.length!==1)throw Error('Receipt metadata update failed');
        deleted++;
      }catch(error){failed++;console.error('Receipt cleanup failed for order id',candidate.id,error.message)}
    }
    return res.status(failed?500:200).json({ok:failed===0,checked,deleted,failed});
  }catch(error){console.error('Receipt cleanup query failed',error.message);return res.status(500).json({ok:false,error:'Cleanup failed'})}
}
