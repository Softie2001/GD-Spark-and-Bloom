import assert from 'node:assert/strict';
import {uploadCloudinary,verifiedCloudinaryUrl,sendAdminMail,cloudinaryConfigured} from '../lib/server.js';
import config from '../api/config.js';

process.env.CLOUDINARY_CLOUD_NAME='gdsbtest';
process.env.CLOUDINARY_API_KEY='test-public-api-key';
process.env.CLOUDINARY_API_SECRET='test-private-api-secret';
process.env.RESEND_API_KEY='re_test_private';
process.env.RESEND_FROM='GD Spark & Bloom <orders@example.org>';
process.env.ADMIN_NOTIFY_EMAIL='vendor@example.org';
process.env.SITE_ORIGIN='https://gd-spark-bloom.example.org';
const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
const img='data:image/jpeg;base64,'+jpg.toString('base64');
const calls=[];
globalThis.fetch=async (uri,init)=>{
 calls.push({uri,init});
 if(String(uri).includes('api.cloudinary.com')){
  assert.equal(init.method,'POST');
  assert.equal(init.body.get('folder'),'gd-spark-bloom/products');
  assert.equal(init.body.get('file').type,'image/jpeg');
  assert.equal(init.headers.Authorization,'Basic '+Buffer.from('test-public-api-key:test-private-api-secret').toString('base64'));
  assert.doesNotMatch(uri,/test-private-api-secret/);
  return {ok:true,json:async()=>({resource_type:'image',secure_url:'https://res.cloudinary.com/gdsbtest/image/upload/v123/gd-spark-bloom/products/sample.jpg'})};
 }
 if(String(uri).includes('api.resend.com')){
  const d=JSON.parse(init.body);
  assert.equal(d.to[0],'vendor@example.org');
  assert.match(d.text,/Pending verification/);
  assert.doesNotMatch(JSON.stringify(d),/receipt_image|data:image|transfer screenshot/);
  return {ok:true,json:async()=>({id:'email_test'})};
 }
 throw new Error('Unexpected network request: '+uri);
};
assert.equal(cloudinaryConfigured(),true);
assert.match(await uploadCloudinary(img),/^https:\/\/res\.cloudinary\.com\/gdsbtest\/image\/upload\//);
assert.throws(()=>verifiedCloudinaryUrl('https://res.cloudinary.com/other/image/upload/a.jpg'),/this store/);
assert.throws(()=>verifiedCloudinaryUrl('https://example.com/a.jpg'),/Cloudinary/);
assert.throws(()=>verifiedCloudinaryUrl('http://res.cloudinary.com/gdsbtest/image/upload/a.jpg'),/Cloudinary/);
assert.throws(()=>verifiedCloudinaryUrl('https://res.cloudinary.com@gdsb.example.com/gdsbtest/image/upload/a.jpg'),/Cloudinary/);
assert.throws(()=>verifiedCloudinaryUrl('javascript:alert(1)'),/Cloudinary/);
assert.equal(verifiedCloudinaryUrl('assets/hero-full.jpg'),'assets/hero-full.jpg');
const mail=await sendAdminMail({reference:'GD-TEST123456',customer_name:'Test Buyer',whatsapp:'08010010010',total:2500});
assert.equal(mail.sent,true);
assert.equal(mail.id,'email_test');
const output={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this},json(obj){this.jsonBody=obj;return this}};
await config({method:'GET'},output);
assert.equal(output.statusCode,200);
assert.equal(output.jsonBody.mediaReady,true);
assert.equal(output.jsonBody.checkoutReady,false); // no Turnstile secrets / Supabase configured
assert.equal(Object.keys(output.jsonBody).includes('CLOUDINARY_API_SECRET'),false);
assert.equal(calls.length,2);
console.log('PASS | Cloudinary public product images signed by server credentials only; restricted URLs');
console.log('PASS | Resend admin email includes reference but no receipt attachment');
console.log('PASS | API config does not expose credentials');
