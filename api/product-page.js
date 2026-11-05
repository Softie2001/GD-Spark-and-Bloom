// Public single-product HTML route. Never expose private settings or admin records.
import {configured,method,rows,q,onError} from '../lib/server.js';
import {cleanProduct} from '../lib/shop.js';
import {productIdValid,renderProductPage} from '../lib/product-seo.js';
export default async function handler(req,res){
 if(method(req,res,['GET']))return;
 const id=String(req.query?.id||'');
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(!productIdValid(id))return res.status(404).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Product not found</title><h1>Product not found</h1><a href="/shop.html">Shop all products</a>');
 if(!configured())return res.status(503).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Store temporarily unavailable</title><h1>Store temporarily unavailable</h1>');
 try{
  const found=await rows('gdsb_products','select=id,name,category,description,price,sale_price,in_stock,best_seller,is_kit,hidden,image_url&id=eq.'+q(id)+'&hidden=eq.false&limit=1');
  if(!found.length)return res.status(404).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Product not found</title><h1>Product not found</h1><a href="/shop.html">Shop all products</a>');
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
  res.setHeader('X-Robots-Tag','index, follow');
  return res.status(200).send(renderProductPage(cleanProduct(found[0])));
 }catch(error){console.error('Public product page failed',error?.message||'unknown');return res.status(503).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Store temporarily unavailable</title><h1>Store temporarily unavailable</h1>')}
}
