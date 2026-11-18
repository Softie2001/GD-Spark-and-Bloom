-- GD Spark & Bloom only. Add optional start/end times to existing product sale prices.
-- IMPORTANT: run on the GD Spark & Bloom Supabase project, never on Vendstal or Urapo.
DO $
BEGIN
 IF to_regclass('public.gdsb_products') IS NULL
    OR to_regclass('public.gdsb_settings') IS NULL
    OR to_regclass('public.gdsb_promotions') IS NULL THEN
   RAISE EXCEPTION 'Not a GD Spark & Bloom storefront database';
 END IF;
END $$;

ALTER TABLE public.gdsb_products
  ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;

DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.gdsb_products'::regclass
    AND conname='gdsb_sale_schedule_dates'
 ) THEN
  ALTER TABLE public.gdsb_products
   ADD CONSTRAINT gdsb_sale_schedule_dates
   CHECK ((sale_starts_at IS NULL OR sale_ends_at IS NOT NULL)
       AND (sale_starts_at IS NULL OR sale_ends_at > sale_starts_at));
 END IF;
END $$;
-- Existing sale_price values remain unchanged and active unless a new schedule is set.
-- No product, price, customer, order or inventory rows are rewritten.

-- Keep atomic order placement and inventory reservation safeguards from the
-- GD-only optional inventory migration, updating only the authoritative price check.
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
