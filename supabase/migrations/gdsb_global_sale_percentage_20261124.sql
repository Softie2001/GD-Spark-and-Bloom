-- GD Spark & Bloom only. No existing product prices or orders are altered.
DO $$
BEGIN
 IF to_regclass('public.gdsb_products') IS NULL
 OR to_regclass('public.gdsb_settings') IS NULL
 OR to_regclass('public.gdsb_promotions') IS NULL
 OR to_regprocedure('public.gdsb_place_order(jsonb,jsonb)') IS NULL THEN
 RAISE EXCEPTION 'Not a GD Spark & Bloom storefront database';
 END IF;
END $$;
ALTER TABLE public.gdsb_settings
 ADD COLUMN IF NOT EXISTS global_sale_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS global_sale_percent integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS global_sale_starts_at timestamptz,
 ADD COLUMN IF NOT EXISTS global_sale_ends_at timestamptz,
 ADD COLUMN IF NOT EXISTS global_sale_promotion_id uuid;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.gdsb_settings'::regclass AND conname='gdsb_global_sale_valid') THEN
 ALTER TABLE public.gdsb_settings
 ADD CONSTRAINT gdsb_global_sale_valid CHECK (
  global_sale_percent BETWEEN 0 AND 99 AND
  (NOT global_sale_enabled OR (global_sale_percent BETWEEN 1 AND 99
    AND global_sale_starts_at IS NOT NULL AND global_sale_ends_at IS NOT NULL
    AND global_sale_ends_at > global_sale_starts_at)));
 END IF;
END $$;
-- Atomic order price verification uses the global sale before product-specific sale prices.
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
  v_global_enabled boolean;
  v_global_percent integer;
  v_global_start timestamptz;
  v_global_end timestamptz;
begin
  -- Serialize checkout with mode switches so an order has one consistent mode.
  select inventory_enabled,global_sale_enabled,global_sale_percent,global_sale_starts_at,global_sale_ends_at
  into v_limits_enabled,v_global_enabled,v_global_percent,v_global_start,v_global_end
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
    v_expected_price := case when v_global_enabled
         and v_global_percent between 1 and 99
         and v_global_start <= now() and now() < v_global_end
      then round(v_product.price::numeric*(100-v_global_percent)/100)::integer
      when v_product.sale_price is not null
         and v_product.sale_price > 0 and v_product.sale_price < v_product.price
         and (v_product.sale_starts_at is null or v_product.sale_starts_at <= now())
         and (v_product.sale_ends_at is null or v_product.sale_ends_at > now())
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
REVOKE ALL ON FUNCTION public.gdsb_place_order(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gdsb_place_order(jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
