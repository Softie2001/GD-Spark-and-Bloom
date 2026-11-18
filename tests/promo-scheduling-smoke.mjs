import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cleanPromotion} from '../lib/shop.js';

const promote={id:'58c84cf1-3b17-4f7e-b94c-b15500f0a9ce',title:'Weekend offer',subtitle:'Save this weekend',
  image_url:'https://res.cloudinary.com/example/image/upload/promo.jpg',
  starts_at:'2026-12-01T10:00:00+01:00',ends_at:'2026-12-02T20:00:00+01:00',
  enabled:true,countdown:true,created_at:'2026-11-16T12:00:00Z'};
const cleaned=cleanPromotion(promote);
assert.equal(cleaned.id,promote.id);
assert.equal(cleaned.title,promote.title);
assert.equal(cleaned.image,promote.image_url);
assert.equal(cleaned.start,promote.starts_at);
assert.equal(cleaned.end,promote.ends_at);
assert.equal(cleaned.active,true);

// Check homepage scheduling and admin controls without any network or database changes.
const mem=new Map(),app={innerHTML:''};
const storage={getItem:key=>mem.get(key)||null,setItem:(key,val)=>mem.set(key,val),removeItem:key=>mem.delete(key)};
const document={addEventListener(){},getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[],
 body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}},createElement:()=>({classList:{add(){}},setAttribute(){},style:{}})};
const ctx={window:{GDSB_EXPECT_BACKEND:true},document,console,Date,Math,Intl,JSON,Set,Map,Array,Promise,Number,String,
  sessionStorage:storage,localStorage:storage,location:{pathname:'/index.html',hash:'',search:'',href:''},
  setInterval:()=>0,setTimeout:()=>0,clearInterval(){},requestAnimationFrame(){},navigator:{},structuredClone,FormData:class{}};
ctx.window.document=document;ctx.window.location=ctx.location;ctx.window.localStorage=storage;
vm.createContext(ctx);vm.runInContext(fs.readFileSync('site.js','utf8'),ctx,{timeout:2000});
const now=Date.now(),iso=ms=>new Date(ms).toISOString();
vm.runInContext('db.promotions=[]',ctx);
assert.match(vm.runInContext('heroDisplay()',ctx),/Your wellness, the herbal way/);
const items=[
 {id:'a',title:'First offer',subtitle:'',image:'',active:true,countdown:false,start:iso(now-3600000),end:iso(now+3600000),createdAt:iso(now-7200000)},
 {id:'b',title:'Second offer',subtitle:'',image:'',active:true,countdown:true,start:iso(now-1800000),end:iso(now+1800000),createdAt:iso(now-5400000)},
 {id:'c',title:'Future offer',subtitle:'',image:'',active:true,countdown:true,start:iso(now+7200000),end:iso(now+10800000),createdAt:iso(now-4000000)},
 {id:'d',title:'Disabled offer',subtitle:'',image:'',active:false,countdown:true,start:iso(now-4000000),end:iso(now+20000000),createdAt:iso(now)}
];
ctx.promoFixture=items;vm.runInContext('db.promotions=promoFixture',ctx);
assert.equal(vm.runInContext('activePromotion()?.id',ctx),'b','Latest started overlapping promotion wins');
assert.match(vm.runInContext('heroDisplay()',ctx),/Second offer/);
assert.equal(vm.runInContext('activePromotion('+Number(now+7200001)+')?.id',ctx),'c','Future schedule activates automatically');
assert.equal(vm.runInContext('activePromotion('+Number(now+20000000)+')',ctx),null,'Ended schedules return to permanent hero');
const rendered=vm.runInContext('bannerAdmin()',ctx);
for(const title of ['Permanent storefront banner','Create promotional banner','First offer','Second offer',
   'Future offer','Disabled offer','Edit','Disable','Enable','Delete','Create & schedule'])assert.ok(rendered.includes(title),title);
assert.equal((rendered.match(/class="gdsb-promo-item"/g)||[]).length,4);
assert.match(rendered,/5 MB/);
vm.runInContext("editPromotion('c')",ctx);
assert.match(vm.runInContext('bannerAdmin()',ctx),/Edit promotional banner/);
assert.match(vm.runInContext('bannerAdmin()',ctx),/Save changes/);
const original=fs.readFileSync('site.js','utf8');
assert.match(original,/data-promo-id/);
assert.match(original,/function updateTimer\(\)\{[\s\S]{0,900}const selected=activePromotion\(\)/);
assert.match(original,/function deletePromotion\(id\)/);
assert.match(original,/function togglePromotion\(id\)/);
const live=fs.readFileSync('live.js','utf8');
for(const action of ['promo-create','promo-update','promo-toggle','promo-delete'])assert.ok(live.includes("'"+action+"'"),action);
const admin=fs.readFileSync('api/admin/mutate.js','utf8');
assert.match(admin,/await checkAdmin\(req\)/);
for(const action of ['promo-create','promo-update','promo-toggle','promo-delete'])assert.ok(admin.includes("case '"+action+"'"),action);
assert.match(admin,/End must be after the start/);
const schema=fs.readFileSync('supabase/migrations/gdsb_multi_promotions_20261116.sql','utf8');
assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.gdsb_promotions/);
assert.match(schema,/CREATE UNIQUE INDEX IF NOT EXISTS gdsb_promotions_one_legacy/);
assert.match(schema,/ON CONFLICT \(legacy_settings\) WHERE legacy_settings DO NOTHING/);
assert.match(schema,/ALTER TABLE public\.gdsb_promotions ENABLE ROW LEVEL SECURITY/);
assert.match(schema,/REVOKE ALL ON TABLE public\.gdsb_promotions FROM PUBLIC,anon,authenticated/);
assert.match(schema,/TO service_role/);
console.log('PASS | Multi-promotion scheduling, overlapping priority, end fallback, independent edit/disable/delete, legacy preservation and RLS');
