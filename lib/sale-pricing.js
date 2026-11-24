// Time-bound product sale prices. Legacy products without a schedule remain on sale.
export function saleActive(p,now=Date.now()){
 const regular=Number(p.price),sale=Number(p.salePrice??p.sale_price??0);
 if(!Number.isFinite(regular)||!Number.isFinite(sale)||sale<=0||sale>=regular)return false;
 const start=p.saleStartsAt??p.sale_starts_at??'',end=p.saleEndsAt??p.sale_ends_at??'';
 if(start){const when=Date.parse(start);if(!Number.isFinite(when)||now<when)return false;}
 if(end){const when=Date.parse(end);if(!Number.isFinite(when)||now>=when)return false;}
 return true;
}
export function effectiveProductPrice(p,now=Date.now()){
 return saleActive(p,now)?Number(p.salePrice??p.sale_price):Number(p.price);
}

export function globalSaleActive(settings,now=Date.now()){
 const g=settings?.globalSale??settings;
 if(!g?.enabled)return false;
 const pct=Number(g.percent),start=Date.parse(g.start||''),end=Date.parse(g.end||'');
 return Number.isInteger(pct)&&pct>=1&&pct<=99&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&now>=start&&now<end;
}
export function priceWithGlobalSale(product,settings,now=Date.now()){
 const regular=Number(product.price);
 if(globalSaleActive(settings,now))return Math.round(regular*(100-Number((settings.globalSale??settings).percent))/100);
 return effectiveProductPrice(product,now);
}
