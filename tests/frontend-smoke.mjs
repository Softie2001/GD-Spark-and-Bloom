import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const catalog={products:[{id:'item1',name:'Herbal Soap',category:'Feminine care',description:'Sample herbal product',price:5000,salePrice:0,stock:true,bestseller:true,hidden:false,kit:false,image:'assets/brand-bag.jpeg'}],categories:['Feminine care'],reviews:[],bank:{name:'Test Store',bank:'Example Bank',number:'1234567890'},heroBanner:{title:'Your wellness, the herbal way.',subtitle:'Natural care',image:'assets/hero-full.jpg'},promoBanner:{active:false,subtitle:'',title:'',start:'',end:'',image:'',countdown:true},couponEntryEnabled:false,orders:[],coupons:[]};
const app={innerHTML:''};const store={};const storage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}};
const document={addEventListener(){},getElementById:k=>k==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[],body:{classList:{toggle(){},add(){},remove(){}},appendChild(){}},createElement:()=>({classList:{add(){}},setAttribute(){},style:{}})};
const ctx={window:{GDSB_EXPECT_BACKEND:true},document,console,JSON,Date,Number,Math,String,Boolean,Set,Map,Promise,Array,Intl,sessionStorage:storage,localStorage:storage,location:{pathname:'/index.html',hash:'',search:'',href:''},setInterval:()=>0,setTimeout:()=>0,clearInterval:()=>{},requestAnimationFrame:()=>0,navigator:{},FormData:class {},fetch:async url=>({ok:true,status:200,json:async()=>url.endsWith('config')?{ready:true,turnstileSiteKey:null}:catalog}),structuredClone};ctx.window.fetch=ctx.fetch;ctx.window.localStorage=storage;ctx.window.sessionStorage=storage;ctx.window.location=ctx.location;ctx.window.document=document;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('site.js','utf8'),ctx,{timeout:2000});vm.runInContext(fs.readFileSync('live.js','utf8'),ctx,{timeout:2000});
for(let i=0;i<30&&app.innerHTML.indexOf('Herbal Soap')<0;i++)await new Promise(resolve=>setTimeout(resolve,15));
assert.match(app.innerHTML,/Herbal Soap/);assert.doesNotMatch(app.innerHTML,/Herbal review examples/);assert.match(app.innerHTML,/Shop our kits/);console.log('PASS | cloud catalogue renders, live mode omits fictional reviews, kit/category page retained');

// Published customer reviews must render in the same bounded, looping viewport as the preview.
vm.runInContext("db.reviews=[{id:'r1',author:'Verified Customer',location:'Lagos',rating:5,text:'Test review',visible:true,consent:true}];render()",ctx,{timeout:2000});
assert.match(app.innerHTML,/id="review-track-window"/);
assert.equal((app.innerHTML.match(/class="review-track-group"/g)||[]).length,3);
assert.equal((app.innerHTML.match(/class="review-card"/g)||[]).length,15,'single review must repeat enough to scroll on desktop');
assert.ok(!app.innerHTML.includes('class="review-viewport"'),'old unbounded review layout must not return');
assert.match(app.innerHTML,/Verified Customer/);
console.log('PASS | live review marquee bounded and replicated for continuous motion');
