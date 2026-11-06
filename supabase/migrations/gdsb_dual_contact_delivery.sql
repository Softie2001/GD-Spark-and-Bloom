-- GD Spark & Bloom ONLY. Do not run in Vendstal or Vendstal Staging.
-- Non-destructive addition: previous orders remain intact, with calling_phone = NULL.
-- Run in the correct GD Spark & Bloom Supabase SQL Editor BEFORE deploying website code.
begin;

do $guard$
begin
 if to_regclass('public.gdsb_orders') is null
    or to_regclass('public.gdsb_products') is null
    or to_regclass('public.gdsb_order_items') is null then
   raise exception 'GD Spark & Bloom order/product tables not found. Wrong database or missing setup.';
 end if;
 if not exists (select 1 from pg_proc where oid='public.gdsb_place_order(jsonb,jsonb)'::regprocedure) then
   raise exception 'Inventory reservation function missing. Run GD stock migration first.';
 end if;
end;
$guard$;

alter table public.gdsb_orders
 add column if not exists calling_phone text;

-- Calling number is mandatory in NEW website/API submissions. Existing orders are preserved.
-- Allow historical NULLs. Keep the column private under the existing orders-table RLS.
do $constraint$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.gdsb_orders'::regclass
    and conname='gdsb_orders_calling_phone_valid'
 ) then
  alter table public.gdsb_orders
   add constraint gdsb_orders_calling_phone_valid
   check (calling_phone is null or calling_phone ~ '^[+0-9 ()-]{10,23}$');
 end if;
end;
$constraint$;

-- Only the order INSERT changes: all stock locks/reservations and price checks remain intact.
create or replace function public.gdsb_place_order(p_order jsonb, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_product public.gdsb_products%rowtype;
  v_line record;
  v_expected_price integer;
begin
  if jsonb_typeof(p_order) is distinct from 'object'
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 40 then
    raise exception using errcode='22023', message='INVALID_ORDER';
  end if;
  if exists (
    select 1 from (
      select x.id from jsonb_to_recordset(p_lines) as x(id text)
      group by x.id having count(*) > 1
    ) duplicate_ids
  ) then
    raise exception using errcode='22023', message='DUPLICATE_ORDER_LINE';
  end if;
  -- Row locks in deterministic product-id order serialize simultaneous checkouts.
  -- All updates and order inserts commit or roll back as ONE transaction.
  for v_line in
    select x.id,x.name,x.qty,x.unit,x.line_total
    from jsonb_to_recordset(p_lines)
      as x(id text,name text,qty integer,unit integer,line_total integer)
    order by x.id
  loop
    if v_line.id is null or v_line.qty is null or v_line.qty not between 1 and 100
       or v_line.unit is null or v_line.unit < 0
       or v_line.line_total is distinct from v_line.qty*v_line.unit then
      raise exception using errcode='22023', message='INVALID_ORDER_LINE';
    end if;
    select * into v_product from public.gdsb_products
      where id=v_line.id for update;
    if not found or v_product.hidden or not v_product.in_stock then
      raise exception using errcode='P0001', message='STOCK_UNAVAILABLE';
    end if;
    if v_product.stock_quantity < v_line.qty then
      raise exception using errcode='P0001', message='INSUFFICIENT_STOCK';
    end if;
    v_expected_price := case when v_product.sale_price is not null
         and v_product.sale_price < v_product.price
      then v_product.sale_price else v_product.price end;
    if v_expected_price <> v_line.unit then
      raise exception using errcode='P0001', message='PRICE_CHANGED';
    end if;
    update public.gdsb_products
      set stock_quantity=stock_quantity-v_line.qty, updated_at=now()
      where id=v_line.id;
  end loop;

  insert into public.gdsb_orders(
    reference,customer_name,whatsapp,calling_phone,delivery_state,city,delivery_address,note,
    subtotal,discount,total,coupon_code,receipt_path,status,stock_reserved,stock_tracked
  ) values (
    p_order->>'reference',p_order->>'customer_name',p_order->>'whatsapp',
    p_order->>'calling_phone',
    p_order->>'delivery_state',p_order->>'city',p_order->>'delivery_address',
    coalesce(p_order->>'note',''),(p_order->>'subtotal')::integer,
    (p_order->>'discount')::integer,(p_order->>'total')::integer,
    nullif(p_order->>'coupon_code',''),p_order->>'receipt_path',
    'Pending verification',true,true
  ) returning id into v_order_id;
  insert into public.gdsb_order_items(
    order_id,product_id,product_name,quantity,unit_price,line_total
  )
  select v_order_id,x.id,x.name,x.qty,x.unit,x.line_total
  from jsonb_to_recordset(p_lines)
    as x(id text,name text,qty integer,unit integer,line_total integer);
  return v_order_id;
end
$function$;

revoke all on function public.gdsb_place_order(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gdsb_place_order(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
