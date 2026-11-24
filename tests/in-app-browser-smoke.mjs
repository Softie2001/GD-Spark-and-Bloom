import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const site=fs.readFileSync('site.js','utf8'),live=fs.readFileSync('live.js','utf8');
for(const page of ['index','shop','admin','admin-product','cart','checkout','payment','success','about','kits','faq','privacy','contact']){
 const html=fs.readFileSync(page+'.html','utf8');
 assert.match(html,/Loading GD Spark &amp; Bloom/);
 assert.match(html,/Unable to load the shop/);
 assert.match(html,/open it in your phone browser/);
}
const host={innerHTML:''},doc={getElementById:id=>id==='app'?host:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}}};
const noStorage={getItem(){throw Error('SecurityError: access denied')},setItem(){throw Error('SecurityError: access denied')},removeItem(){throw Error('SecurityError: access denied')}};
const ctx={window:{GDSB_EXPECT_BACKEND:true},document:doc,console,Date,Math,Intl,JSON,Set,Map,Array,Number,String,Promise,sessionStorage:noStorage,localStorage:noStorage,location:{pathname:'/',hash:'',search:'',href:''},setInterval:()=>0,setTimeout:()=>0,clearInterval(){},requestAnimationFrame(){},navigator:{},FormData:class{},URLSearchParams};
ctx.window.document=doc;ctx.window.location=ctx.location;
vm.createContext(ctx);
vm.runInContext(site,ctx,{timeout:3000});
assert.equal(vm.runInContext('page',ctx),'home');
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('cart',ctx))),{});
vm.runInContext("gdsbSession.setItem('test','value')",ctx);
assert.equal(vm.runInContext("gdsbSession.getItem('test')",ctx),'value');
vm.runInContext("gdsbSession.removeItem('test')",ctx);
assert.equal(vm.runInContext("gdsbSession.getItem('test')",ctx),null);
assert.match(live,/gdsbSession\.getItem\('gdsb_admin_token'\)/);
assert.ok(!site.includes("JSON.parse(sessionStorage.getItem('gdsb_cart')"));
console.log('PASS | blocked in-app storage does not crash site; visible loading fallback on all storefront pages');
