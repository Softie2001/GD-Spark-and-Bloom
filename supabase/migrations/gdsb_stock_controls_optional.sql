-- GD Spark & Bloom only. DO NOT run in Vendstal or Vendstal Staging.
-- Non-destructive upgrade: stock limits can be toggled independently of each product's "Available for sale".
-- Default ON preserves existing live stock enforcement until admin explicitly disables it.
-- Display count defaults OFF. Existing orders and reservation history are never modified.
-- Requires existing GD stock migration + calling_phone migration.
begin;

do $guard$
begin
 if to_regclass('public.gdsb_settings') is null
    or to_regclass('public.gdsb_products') is null
    or to_regclass('public.gdsb_orders') is null
    or to_regclass('public.gdsb_order_items') is null then
   raise exception 'Missing GD Spark & Bloom storefront tables. Check the target project.';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='gdsb_orders' and column_name='calling_phone') then
   raise exception 'GD calling phone migration is required first.';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='gdsb_orders' and column_name='stock_tracked') then
   raise exception 'GD stock migration is required first.';
 end if;
end;
$guard$;

alter table public.gdsb_settings
  add column if not exists inventory_enabled boolean not null default true;
alter table public.gdsb_settings
  add column if not exists inventory_show_quantity boolean not null default false;

-- This version preserves the current calling phone field, price checks,
-- duplicate-line prevention, deterministic product locks, and order-item insertion.
-- With limits OFF, it still rejects hidden/paused products and invalid prices/quantities,
-- but does not check, decrement, or reserve numerical inventory.
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
  v_limits_enabled boolean;
begin
  -- Serialize checkout with mode switches so an order has one consistent mode.
  select inventory_enabled into v_limits_enabled
    from public.gdsb_settings where id=1 for update;
  if not found then
    raise exception using errcode='P0001',message='STORE_SETTINGS_MISSING';
  end if;
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
    if v_limits_enabled and v_product.stock_quantity < v_line.qty then
      raise exception using errcode='P0001', message='INSUFFICIENT_STOCK';
    end if;
    v_expected_price := case when v_product.sale_price is not null
         and v_product.sale_price < v_product.price
      then v_product.sale_price else v_product.price end;
    if v_expected_price <> v_line.unit then
      raise exception using errcode='P0001', message='PRICE_CHANGED';
    end if;
    if v_limits_enabled then
      update public.gdsb_products
        set stock_quantity=stock_quantity-v_line.qty, updated_at=now()
        where id=v_line.id;
    end if;
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
    'Pending verification',v_limits_enabled,v_limits_enabled
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
