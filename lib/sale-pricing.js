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
