import {configured,body,method,fail,onError,required,rows,q} from '../../lib/server.js';
export default async function handler(req,res){if(method(req,res,['POST']))return;if(!configured())return fail(res,503,'Admin setup in progress');try{
 const d=body(req),email=required(d.email,'Email',255),password=required(d.password,'Password',255);
 const r=await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 if(!r.ok)return fail(res,401,'Incorrect email or password');const session=await r.json();
 const u=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`}}).then(x=>x.json());
 if(!u?.id)return fail(res,401,'Could not verify admin');const m=await rows('gdsb_admin_members',`select=user_id&user_id=eq.${q(u.id)}&limit=1`);if(!m.length)return fail(res,403,'This user is not an authorised store administrator');
 res.setHeader('Cache-Control','no-store');return res.status(200).json({token:session.access_token,expiresIn:session.expires_in||3600,email:u.email});
 }catch(err){return onError(res,err)}}
