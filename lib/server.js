// GD Spark & Bloom — server-only helpers. Never import from public site.js.
import {randomUUID, createHash} from 'node:crypto';

export function configured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.SUPABASE_ANON_KEY)}
export function fail(res, status, message){return res.status(status).json({error:message})}
export function method(req,res, allowed){if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));return fail(res,405,'Method not allowed')}return null}
export function body(req){if(Number(req.headers['content-length']||0)>3100000)throw Object.assign(new Error('Upload too large'),{status:413});let data=req.body;if(typeof data==='string')data=JSON.parse(data);if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(new Error('Invalid request'),{status:400});return data}
export function tidy(value,max=160){return String(value??'').trim().slice(0,max)}
export function money(value){return Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null}
export function safeError(err){const s=Number(err?.status)||500;return {status:s,message:s>=500?'A server error occurred. Please try again.':err?.message||'Invalid request'}}
export function onError(res,err){const e=safeError(err);if(e.status>=500)console.error('GDSB API error',err?.message||'unknown');return fail(res,e.status,e.message)}
export function clientHeaders(admin=true){const key=admin?process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_ANON_KEY;if(!key)throw new Error('Backend not configured');return {'apikey':key,...(key.startsWith('eyJ')?{'Authorization':`Bearer ${key}`}:{})}}
export async function supa(path,{method='GET',data,headers={}}={}){
 if(!configured())throw Object.assign(new Error('Backend not configured'),{status:503});
 const url=process.env.SUPABASE_URL.replace(/\/$/,'')+path;
 const hs={...clientHeaders(true),...headers};if(data!==undefined)hs['Content-Type']='application/json';
 const response=await fetch(url,{method,headers:hs,body:data===undefined?undefined:JSON.stringify(data)});
 const text=await response.text();let result;try{result=text?JSON.parse(text):null}catch{result=text}
 if(!response.ok){let e=new Error('Database request failed');e.status=response.status>=500?502:response.status;e.info=result;throw e}
 return result;
}
export async function rows(table,query=''){return await supa(`/rest/v1/${table}?${query}`,{headers:{Accept:'application/json'}})}
export async function add(table,record){return await supa(`/rest/v1/${table}`,{method:'POST',data:record,headers:{Prefer:'return=representation'}})}
export async function patch(table,query,record){return await supa(`/rest/v1/${table}?${query}`,{method:'PATCH',data:record,headers:{Prefer:'return=representation'}})}
export async function remove(table,query){return await supa(`/rest/v1/${table}?${query}`,{method:'DELETE',headers:{Prefer:'return=representation'}})}
export const q = value=>encodeURIComponent(String(value));
export function required(v,label,max=160){const s=tidy(v,max);if(!s)throw Object.assign(new Error(label+' is required'),{status:400});return s}
export function checkPhone(phone){let p=required(phone,'WhatsApp number',23);if(!/^\+?[0-9\s()\-]{10,23}$/.test(p))throw Object.assign(new Error('Enter a valid WhatsApp number'),{status:400});return p}
export async function checkAdmin(req){
 const bearer=(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];if(!bearer)throw Object.assign(new Error('Admin sign-in required'),{status:401});
 const userRes=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{'apikey':process.env.SUPABASE_ANON_KEY,'Authorization':`Bearer ${bearer}`}});
 if(!userRes.ok)throw Object.assign(new Error('Admin session expired. Sign in again.'),{status:401});
 const user=await userRes.json();if(!user?.id)throw Object.assign(new Error('Invalid admin session'),{status:401});
 const members=await rows('gdsb_admin_members',`select=user_id&user_id=eq.${q(user.id)}&limit=1`);
 if(!members.length)throw Object.assign(new Error('Admin access not granted'),{status:403});return user;
}
export function decodeImage(data,maxBytes=1048576){
 if(typeof data!=='string'||data.length>Math.ceil(maxBytes*4/3)+160)throw Object.assign(new Error('Image too large'),{status:413});
 const m=data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!m)throw Object.assign(new Error('Upload a JPG, PNG or WebP image'),{status:400});
 const bytes=Buffer.from(m[2],'base64');if(!bytes.length||bytes.length>maxBytes)throw Object.assign(new Error('Image too large'),{status:413});
 const mime=m[1],magic=(mime==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)||(mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||(mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
 if(!magic)throw Object.assign(new Error('Image file does not match its format'),{status:400});return {bytes,mime,ext:mime.split('/')[1].replace('jpeg','jpg')};
}

// Public product/banner media lives in Cloudinary. Payment receipts remain PRIVATE in Supabase Storage.
export function cloudinaryConfigured(){return Boolean(process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET)}
export function verifiedCloudinaryUrl(value){
 const raw=tidy(value,2048);if(!raw)return '';
 if(raw.startsWith('assets/'))return raw;
 let u;try{u=new URL(raw)}catch{throw Object.assign(new Error('Use a Cloudinary image URL or upload an image'),{status:400})}
 const cloud=process.env.CLOUDINARY_CLOUD_NAME;
 if(!cloud||u.protocol!=='https:'||u.username||u.password||u.hostname!=='res.cloudinary.com'||
   !u.pathname.startsWith(`/${encodeURIComponent(cloud)}/image/upload/`))
   throw Object.assign(new Error('Use an image from this store’s Cloudinary account, or upload a new image'),{status:400});
 return u.toString();
}
export async function uploadCloudinary(raw){
 if(!cloudinaryConfigured())throw Object.assign(new Error('Cloudinary image storage is not configured'),{status:503});
 const cloud=process.env.CLOUDINARY_CLOUD_NAME;
 if(!/^[a-zA-Z0-9_-]{2,80}$/.test(cloud))throw Object.assign(new Error('Invalid Cloudinary configuration'),{status:503});
 const {bytes,mime,ext}=decodeImage(raw);
 const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),`product.${ext}`);
 form.append('folder','gd-spark-bloom/products');
 const basic=Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString('base64');
 const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`,{
  method:'POST',headers:{Authorization:`Basic ${basic}`},body:form
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error('Cloudinary upload failed'),{status:502});
 if(!data.secure_url||data.resource_type!=='image')throw Object.assign(new Error('Cloudinary did not return an image'),{status:502});
 return verifiedCloudinaryUrl(data.secure_url);
}

export async function uploadImage(bucket,path,raw){
 const {bytes,mime}=decodeImage(raw);const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{...clientHeaders(true),'Content-Type':mime,'x-upsert':'false'},body:bytes});
 if(!response.ok)throw Object.assign(new Error('Could not store image'),{status:502});return path;
}
export async function deleteReceipt(path){if(!path)return;await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/gdsb-receipts/${path}`,{method:'DELETE',headers:clientHeaders(true)}).catch(()=>{})}
export async function receiptUrl(path){if(!path)return null;const result=await supa(`/storage/v1/object/sign/gdsb-receipts/${path}`,{method:'POST',data:{expiresIn:300}});return result?.signedURL?process.env.SUPABASE_URL+result.signedURL:null}
export function newOrderRef(){return 'GD-'+Date.now().toString(36).toUpperCase()+'-'+randomUUID().slice(0,7).toUpperCase()}
export function fmt(n){return '₦'+Number(n||0).toLocaleString('en-NG')}
export function htmlEscape(t){return String(t).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
export async function sendAdminMail(order){
 const api=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM,to=process.env.ADMIN_NOTIFY_EMAIL;
 if(!api||!from||!to)return {sent:false,error:'Resend not configured'};
 const id=order.reference,subject=`New GD Spark & Bloom order — ${id}`;
 const site=(process.env.SITE_ORIGIN||'').replace(/\/$/,'');
 const text=`New order awaiting payment verification\nOrder: ${id}\nCustomer: ${order.customer_name}\nWhatsApp: ${order.whatsapp}\nTotal: ${fmt(order.total)}\nStatus: Pending verification\nReview it in the secure admin dashboard: ${site}/admin.html\n\nCheck the transfer in your bank account before confirming. A receipt is not proof of payment.`;
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${api}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text,reply_to:process.env.ADMIN_REPLY_TO||undefined,headers:{'X-GDSB-Order-Ref':id}})});
 const result=await res.json().catch(()=>({}));if(!res.ok)return {sent:false,error:'Resend returned HTTP '+res.status};return {sent:true,id:result.id||null};
}
export function hashObject(t){return createHash('sha256').update(t).digest('hex')}
