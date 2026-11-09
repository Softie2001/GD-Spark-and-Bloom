import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanProduct,cleanSettings,quote} from '../lib/shop.js';
import {renderProductPage} from '../lib/product-seo.js';

process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='testing-only';
const settings={id:1,coupon_entry_enabled:false,inventory_enabled:false,inventory_show_quantity:false};
const products=[
 {id:'p1',name:'Always orderable',price:4000,sale_price:null,in_stock:true,stock_quantity:0,hidden:false},
 {id:'p2',name:'Paused',price:3000,sale_price:null,in_stock:false,stock_quantity:8,hidden:false},
 {id:'p3',name:'Hidden',price:1000,sale_price:null,in_stock:true,stock_quantity:9,hidden:true}
];
globalThis.fetch=async(url)=>{
 const u=new URL(url);
 const data=u.pathname.endsWith('/gdsb_settings')?[settings]:u.pathname.endsWith('/gdsb_products')?products:[];
 return {ok:true,status:200,text:async()=>JSON.stringify(data)};
};

assert.equal(cleanProduct(products[0],false).stock,true,'Zero stock is orderable when limits are off');
assert.equal(cleanProduct(products[0],true).stock,false,'Zero stock sells out when limits are on');
assert.equal(cleanProduct(products[1],false).stock,false,'Paused products are never orderable');
assert.equal(cleanSettings(settings).inventoryEnabled,false);
assert.equal(cleanSettings(settings).inventoryShowQuantity,false);

const normal=await quote({items:[{id:'p1',qty:10}]});
assert.equal(normal.subtotal,40000,'Normal selling ignores the saved stock count');
await assert.rejects(quote({items:[{id:'p2',qty:1}]}),/unavailable/);
await assert.rejects(quote({items:[{id:'p3',qty:1}]}),/unavailable/);

settings.inventory_enabled=true;
await assert.rejects(quote({items:[{id:'p1',qty:1}]}),/Not enough stock/);
products[0].stock_quantity=3;
assert.equal((await quote({items:[{id:'p1',qty:3}]})).subtotal,12000);
await assert.rejects(quote({items:[{id:'p1',qty:4}]}),/Not enough stock/);

const shown=renderProductPage(cleanProduct(products[0],true),{inventoryEnabled:true,inventoryShowQuantity:true});
const hidden=renderProductPage(cleanProduct(products[0],true),{inventoryEnabled:true,inventoryShowQuantity:false});
const unlimited=renderProductPage(cleanProduct({...products[0],stock_quantity:0},false),{inventoryEnabled:false,inventoryShowQuantity:true});
assert.match(shown,/3 available/);
assert.doesNotMatch(hidden,/3 available/);
assert.doesNotMatch(unlimited,/0 available/);
assert.match(unlimited,/Available to order/);
assert.match(unlimited,/const limited=false/);
assert.match(shown,/const limited=true/);

const site=fs.readFileSync('site.js','utf8');
const live=fs.readFileSync('live.js','utf8');
const admin=fs.readFileSync('api/admin/mutate.js','utf8');
const catalog=fs.readFileSync('api/catalog.js','utf8');
const product=fs.readFileSync('api/product-page.js','utf8');
const sql=fs.readFileSync('supabase/migrations/gdsb_stock_controls_optional.sql','utf8');

assert.match(site,/function inventoryControls\(\)/);
assert.match(site,/Enable stock limits/);
assert.match(site,/Show available numbers to customers/);
assert.match(site,/stockVisible\(\)/);
assert.match(site,/stockLimited\(\)/);
assert.match(live,/gdsbWrite\('inventory-settings'/);
assert.match(admin,/case 'inventory-settings'/);
assert.match(admin,/typeof payload\.inventoryEnabled!=='boolean'/);
assert.match(catalog,/cleanProduct\(x,s\.inventory_enabled!==false\)/);
assert.match(product,/inventoryShowQuantity:s\.inventory_show_quantity===true/);
assert.match(sql,/inventory_enabled boolean not null default true/);
assert.match(sql,/inventory_show_quantity boolean not null default false/);
assert.match(sql,/from public\.gdsb_settings where id=1 for update/);
assert.match(sql,/if v_limits_enabled and v_product\.stock_quantity < v_line\.qty/);
assert.match(sql,/if v_limits_enabled then\s+update public\.gdsb_products/);
assert.match(sql,/'Pending verification',v_limits_enabled,v_limits_enabled/);
assert.match(sql,/p_order->>'calling_phone'/);
assert.match(sql,/grant execute on function public\.gdsb_place_order\(jsonb,jsonb\) to service_role/);
assert.match(sql,/revoke all on function public\.gdsb_place_order\(jsonb,jsonb\) from public,anon,authenticated/);
console.log('PASS | Normal selling ignores zero stock; limited selling enforces quantity; paused products always blocked');
console.log('PASS | Public quantity display opt-in on cards and product pages, admin toggles and atomic checkout migration');
