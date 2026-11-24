// Public single-product HTML route. Never expose private settings or admin records.
import {configured,method,rows,q,onError} from '../lib/server.js';
import {cleanProduct,settings} from '../lib/shop.js';
import {productIdValid,renderProductPage} from '../lib/product-seo.js';
export default async function handler(req,res){
 if(method(req,res,['GET']))return;
 const id=String(req.query?.id||'');
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(!productIdValid(id))return res.status(404).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Product not found</title><h1>Product not found</h1><a href="/shop.html">Shop all products</a>');
 if(!configured())return res.status(503).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Store temporarily unavailable</title><h1>Store temporarily unavailable</h1>');
 try{
  const [found,s]=await Promise.all([rows('gdsb_products','select=id,name,category,description,price,sale_price,sale_starts_at,sale_ends_at,in_stock,stock_quantity,best_seller,is_kit,hidden,image_url&id=eq.'+q(id)+'&hidden=eq.false&limit=1'),settings()]);
  if(!found.length)return res.status(404).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Product not found</title><h1>Product not found</h1><a href="/shop.html">Shop all products</a>');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','index, follow');
  return res.status(200).send(renderProductPage(cleanProduct(found[0],s.inventory_enabled!==false),{inventoryEnabled:s.inventory_enabled!==false,inventoryShowQuantity:s.inventory_show_quantity===true,globalSale:{enabled:s.global_sale_enabled,percent:s.global_sale_percent,start:s.global_sale_starts_at,end:s.global_sale_ends_at}}));
 }catch(error){console.error('Public product page failed',error?.message||'unknown');return res.status(503).setHeader('X-Robots-Tag','noindex').send('<!doctype html><title>Store temporarily unavailable</title><h1>Store temporarily unavailable</h1>')}
}
