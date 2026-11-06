import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanOrder} from '../lib/shop.js';
import {checkPhone,sendAdminMail} from '../lib/server.js';

const site=fs.readFileSync('site.js','utf8');
const live=fs.readFileSync('live.js','utf8');
const endpoint=fs.readFileSync('api/orders.js','utf8');
const migration=fs.readFileSync('supabase/migrations/gdsb_dual_contact_delivery.sql','utf8');
const admin=fs.readFileSync('api/admin/mutate.js','utf8');
const schema=fs.readFileSync('supabase/schema.sql','utf8');

// Two different, independently editable delivery fields.
assert.match(site,/<label>WhatsApp number \*<\/label><input name="phone"[^>]*required/);
assert.match(site,/<label>Calling number \*<\/label><input name="callPhone"[^>]*required/);
assert.match(site,/c\.phone\|\|''/);
assert.match(site,/c\.callPhone\|\|''/);
assert.match(site,/d\.callPhone=String\(d\.callPhone/);
assert.match(site,/if\(!c\|\|!c\.callPhone\)/);
assert.match(live,/if\(!String\(customer\.callPhone\|\|''\)\.trim\(\)\)/);
assert.match(endpoint,/calling_phone:checkPhone\(customer\.callPhone,'Calling number'\)/);

assert.equal(checkPhone('08012345678'),'08012345678');
assert.equal(checkPhone('+234 801 234 5678','Calling number'),'+234 801 234 5678');
assert.throws(()=>checkPhone('', 'Calling number'),/Calling number is required/);
assert.throws(()=>checkPhone('12345', 'Calling number'),/valid calling number/);

const sample={id:'ord1',reference:'GD-12345678',customer_name:'Buyer',whatsapp:'08012345678',
 calling_phone:'09022222222',delivery_state:'Lagos',city:'Ikeja',delivery_address:'Address',
 note:'',gdsb_order_items:[],subtotal:1500,discount:0,total:1500,status:'Pending verification'};
const cleaned=cleanOrder(sample);
assert.equal(cleaned.customer.phone,'08012345678');
assert.equal(cleaned.customer.callPhone,'09022222222');
assert.equal(cleanOrder({...sample,calling_phone:null}).customer.callPhone,'');
assert.match(site,/<span>WhatsApp<\/span><strong>\$\{esc\(customer\.phone\|\|'—'\)\}<\/strong>/);
assert.match(site,/<span>Calling number<\/span><strong>\$\{esc\(customer\.callPhone\|\|'—'\)\}<\/strong>/);

assert.match(migration,/add column if not exists calling_phone text/);
assert.match(migration,/p_order->>'calling_phone'/);
assert.match(migration,/stock_quantity=stock_quantity-v_line\.qty/);
assert.match(migration,/where id=v_line\.id for update/);
assert.match(migration,/revoke all on function public\.gdsb_place_order\(jsonb,jsonb\) from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.gdsb_place_order\(jsonb,jsonb\) to service_role/);
assert.match(schema,/calling_phone text/);
assert.match(admin,/calling_phone:o\.calling_phone/);

// Both numbers appear in the new-order email. The existing admin retry also preserves both.
const originalFetch=globalThis.fetch;
const old={RESEND_API_KEY:process.env.RESEND_API_KEY,RESEND_FROM:process.env.RESEND_FROM,
 ADMIN_NOTIFY_EMAIL:process.env.ADMIN_NOTIFY_EMAIL,SITE_ORIGIN:process.env.SITE_ORIGIN};
let email;
try {
 process.env.RESEND_API_KEY='dummy-test-only';
 process.env.RESEND_FROM='store@example.test';
 process.env.ADMIN_NOTIFY_EMAIL='owner@example.test';
 process.env.SITE_ORIGIN='https://gdsparkandbloom.com.ng';
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  email=JSON.parse(options.body);
  return {ok:true,json:async()=>({id:'email-test'})};
 };
 const mailed=await sendAdminMail({reference:'GD-12345678',customer_name:'Buyer',
   whatsapp:'08012345678',calling_phone:'09022222222',total:1500});
 assert.equal(mailed.sent,true);
 assert.match(email.text,/WhatsApp: 08012345678/);
 assert.match(email.text,/Calling number: 09022222222/);
} finally {
 globalThis.fetch=originalFetch;
 for(const [name,value] of Object.entries(old)){
  if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
}
console.log('PASS | Separate customer numbers, backend validation, admin display, emails');
console.log('PASS | Legacy order compatibility; inventory reservations and role restrictions retained');
