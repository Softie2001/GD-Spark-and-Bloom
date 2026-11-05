import assert from 'node:assert/strict';
import handler from '../api/receipt-cleanup.js';
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='eyJmockservice';
process.env.SUPABASE_ANON_KEY='eyJmockanon';
process.env.CRON_SECRET='local-smoke-secret';
const past=new Date(Date.now()-21*86400000).toISOString();
const item={id:'f0e6edb4-f993-45dd-ad36-e621ec6b85bd',receipt_path:'2026-10-01/f0e6edb4-f993-45dd-ad36-e621ec6b85bd.jpg',status:'Payment confirmed',payment_confirmed_at:past,receipt_deleted_at:null};
let state={...item};let actions=[];let deleteStatus=204;
globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url);actions.push({path:u.pathname,method:opts.method||'GET'});
  if(u.pathname.startsWith('/storage/v1/object/'))return {ok:deleteStatus>=200&&deleteStatus<300,status:deleteStatus};
  if(u.pathname==='/rest/v1/gdsb_orders'){
    if(opts.method==='PATCH'){
      Object.assign(state,JSON.parse(opts.body));return {ok:true,status:200,text:async()=>JSON.stringify([state])};
    }
    const data=u.searchParams.has('id')?[state]:[state];
    return {ok:true,status:200,text:async()=>JSON.stringify(data)};
  }
  throw Error('Unexpected URL: '+u.pathname);
};
function response(){return {statusCode:200,body:null,setHeader(){},status(n){this.statusCode=n;return this},json(data){this.body=data;return this}}}
let res=response();await handler({method:'GET',headers:{}},res);
assert.equal(res.statusCode,401);assert.equal(actions.length,0,'unauthorized callers must not access storage');
res=response();await handler({method:'GET',headers:{authorization:'Bearer local-smoke-secret'}},res);
assert.equal(res.statusCode,200);assert.equal(res.body.deleted,1);assert.equal(state.receipt_path,'');assert.ok(state.receipt_deleted_at);assert.ok(actions.some(x=>x.method==='DELETE'));
state={...item,status:'Payment not confirmed'};actions=[];
res=response();await handler({method:'GET',headers:{authorization:'Bearer local-smoke-secret'}},res);
assert.equal(res.statusCode,500,'disallowed candidate status is reported without deleting');
assert.ok(!actions.some(x=>x.method==='DELETE'),'unconfirmed receipt must not be deleted');
state={...item};actions=[];deleteStatus=403;
res=response();await handler({method:'GET',headers:{authorization:'Bearer local-smoke-secret'}},res);
assert.equal(res.statusCode,500);assert.ok(!actions.some(x=>x.method==='PATCH'),'failed storage delete must never mark receipt deleted');
console.log('PASS | 20-day receipt expiry is authenticated, order metadata retained, unconfirmed or failed deletions protected');
