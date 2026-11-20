import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync('site.js','utf8');
const live=fs.readFileSync('live.js','utf8');
const server=fs.readFileSync('lib/server.js','utf8');
const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert.match(server,/\$\{site\}\/admin\\n/);
assert.doesNotMatch(server,/\$\{site\}\/admin\.html/);
assert.ok(vercel.rewrites.some(r=>r.source==='/admin'&&r.destination==='/admin.html'));
assert.match(live,/messageOrderCustomer\(id,m\)/);
assert.match(js,/onclick="messageOrderCustomer\('\$\{orderId\}','generic'\)"/);
const store=new Map();
const document={addEventListener(){},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}}};
const opened=[];
const ctx={window:{GDSB_EXPECT_BACKEND:true,open:(url)=>opened.push(url)},document,console,Date,Math,Intl,JSON,Set,Map,Array,Number,String,Promise,
 sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 location:{pathname:'/admin',hash:'',search:'',href:''},
 setInterval:()=>0,setTimeout:()=>0,clearInterval(){},URLSearchParams,requestAnimationFrame(){},navigator:{},structuredClone,FormData:class{}};
ctx.window.document=document;ctx.window.location=ctx.location;
vm.createContext(ctx);vm.runInContext(js,ctx,{timeout:3000});
const cases=[['09130518161','2349130518161'],['9130518161','2349130518161'],['2349130518161','2349130518161'],['+234 913 051 8161','2349130518161'],['08168706476','2348168706476'],['2348168706476','2348168706476'],['',''],['123',''],['+2340000000000','']];
for(const [input,expected] of cases){ctx.input=input;assert.equal(vm.runInContext('customerWhatsAppNumber(input)',ctx),expected,input);}
ctx.sample={id:'GD-TEST',total:2500,customer:{name:'Example customer',phone:'09130518161'}};
assert.ok(vm.runInContext('customerWhatsAppUrl(sample,"confirmed")',ctx).startsWith('https://wa.me/2349130518161?text='));
assert.match(decodeURIComponent(vm.runInContext('customerWhatsAppUrl(sample,"confirmed")',ctx)),/verified your payment/);
assert.equal(vm.runInContext('customerWhatsAppUrl({...sample,customer:{name:"No number",phone:""}})',ctx),'');
assert.ok(!vm.runInContext('customerWhatsAppUrl(sample)',ctx).includes('undefined'));
vm.runInContext('db.orders=[sample]',ctx);
vm.runInContext("messageOrderCustomer('GD-TEST','generic')",ctx);
assert.equal(opened.length,1);
assert.ok(opened[0].startsWith('https://wa.me/2349130518161?text='));
assert.ok(!opened[0].includes('wa.me/2348121000583'));
console.log('PASS | clean email admin URL; order customer WhatsApp recipient and status messages; phone normalization; missing number guard');
