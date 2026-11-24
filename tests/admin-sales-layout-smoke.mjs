import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('site.js','utf8');
const storage={getItem:()=>null,setItem(){},removeItem(){}};
const doc={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}}};
const ctx={window:{GDSB_EXPECT_BACKEND:true},document:doc,console,Date,Math,Intl,JSON,Set,Map,Array,Number,String,Promise,sessionStorage:storage,localStorage:storage,location:{pathname:'/admin',hash:'#products',search:'',href:''},setInterval:()=>0,setTimeout:()=>0,clearInterval(){},requestAnimationFrame(){},navigator:{},structuredClone,FormData:class{},URLSearchParams};
ctx.window.document=doc;ctx.window.location=ctx.location;
vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:3000});
ctx.sample={id:'prod-test',name:'Sample product',category:'Wellness',price:10000,salePrice:8000,enabled:true,stock:true,availableQuantity:4,hidden:false,bestseller:false,kit:false};
ctx.sale={enabled:false,percent:20,start:'2026-11-30T00:00:00Z',end:'2026-12-12T00:00:00Z'};
vm.runInContext('db.products=[sample];db.globalSale=sale;db.promotions=[];db.inventoryEnabled=false;db.inventoryShowQuantity=false',ctx);
const products=vm.runInContext('productsAdmin()',ctx),banner=vm.runInContext('bannerAdmin()',ctx);
assert.match(products,/Stock controls/);
assert.match(products,/Add product/);
assert.match(products,/gdsb-admin-product-card/);
assert.match(products,/gdsb-admin-product-overview/);
assert.match(products,/gdsb-admin-product-quantity-row/);
assert.doesNotMatch(products,/gdsb-admin-product-body/);
assert.match(products,/saveProductQuantity/);
assert.match(products,/Available quantity/);
assert.match(products,/Out of stock/);
assert.doesNotMatch(products,/<table/);
assert.match(fs.readFileSync('live.js','utf8'),/gdsbWrite\('product-quantity'/);
assert.match(fs.readFileSync('api/admin/mutate.js','utf8'),/case 'product-quantity'/);
assert.match(products,/Sample product/);
assert.doesNotMatch(products,/Automatic percentage sale/);
assert.doesNotMatch(products,/Schedule multiple product sale prices/);
assert.doesNotMatch(products,/name="bulkSaleId"/);
assert.match(banner,/Automatic percentage sale/);
assert.doesNotMatch(banner,/Schedule multiple product sale prices/);
assert.doesNotMatch(banner,/name="bulkSaleId"/);





assert.doesNotMatch(products,/When enabled, enter each product/);
assert.doesNotMatch(products,/Existing stock counts are kept/);
assert.match(products,/Limit orders to the quantities entered/);


console.log('PASS | Compact no-gap product cards, bulk scheduler hidden, automatic sale retained and individual product sale editor preserved');

assert.match(source,/Sale price \(₦\)/);
assert.match(source,/Sale ends \(date & time\)/);
