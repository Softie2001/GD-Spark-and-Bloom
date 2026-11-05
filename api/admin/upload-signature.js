// Issue short-lived, authenticated Cloudinary upload credentials for admin images.
// File bytes go browser -> Cloudinary (not through Vercel's function body limit).
import {createHash,randomUUID} from 'node:crypto';
import {configured,cloudinaryConfigured,checkAdmin,method,fail,onError} from '../../lib/server.js';

export default async function handler(req,res){
  if(method(req,res,['POST']))return;
  res.setHeader('Cache-Control','no-store');
  if(!configured()||!cloudinaryConfigured())return fail(res,503,'Admin image upload is not configured');
  try{
    await checkAdmin(req);
    const cloud=process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey=process.env.CLOUDINARY_API_KEY;
    if(!/^[a-zA-Z0-9_-]{2,80}$/.test(cloud)||!apiKey)return fail(res,503,'Invalid image storage configuration');
    const folder='gd-spark-bloom/products';
    const publicId='admin-'+randomUUID().replace(/-/g,'');
    const timestamp=Math.floor(Date.now()/1000);
    // Cloudinary signs alphabetically sorted upload parameters with the server-only API secret.
    const signed='folder='+folder+'&public_id='+publicId+'&timestamp='+timestamp;
    const signature=createHash('sha1').update(signed+process.env.CLOUDINARY_API_SECRET).digest('hex');
    return res.status(200).json({cloud,apiKey,folder,publicId,timestamp,signature,maxBytes:5*1024*1024});
  }catch(error){return onError(res,error)}
}
