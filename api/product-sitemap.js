// Automatically includes newly published, non-hidden products in the product sitemap.
import {configured,method,rows} from '../lib/server.js';
import {renderProductSitemap} from '../lib/product-seo.js';
export default async function handler(req,res){
 if(method(req,res,['GET']))return;
 if(!configured())return res.status(503).json({error:'Store temporarily unavailable'});
 try{
  const products=await rows('gdsb_products','select=id,name,hidden&hidden=eq.false&order=created_at.desc');
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).send(renderProductSitemap(products));
 }catch(error){console.error('Public product sitemap failed',error?.message||'unknown');return res.status(503).json({error:'Sitemap temporarily unavailable'})}
}
