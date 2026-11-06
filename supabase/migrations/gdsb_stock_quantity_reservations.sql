-- GD Spark & Bloom only. NEVER execute in Vendstal or Vendstal Staging.
-- Apply in the dedicated GD Spark & Bloom Supabase project BEFORE publishing stock-aware code.
-- IMPORTANT: all existing products begin with 0 available units until the admin enters real counts.
-- Stock is reserved on successful receipt-backed order submission, NOT on add-to-cart.
-- Pending verification reserves stock. Cancelled / Payment not confirmed releases it once.
begin;

alter table public.gdsb_products
  add column if not exists stock_quantity integer not null default 0;
alter table public.gdsb_products
  drop constraint if exists gdsb_products_stock_quantity_check;
alter table public.gdsb_products
  add constraint gdsb_products_stock_quantity_check
  check (stock_quantity between 0 and 1000000);

alter table public.gdsb_orders
  add column if not exists stock_reserved boolean not null default false;

-- Legacy orders predate inventory tracking; never release stock for those historical orders.

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
    reference,customer_name,whatsapp,delivery_state,city,delivery_address,note,
    subtotal,discount,total,coupon_code,receipt_path,status,stock_reserved
  ) values (
    p_order->>'reference',p_order->>'customer_name',p_order->>'whatsapp',
    p_order->>'delivery_state',p_order->>'city',p_order->>'delivery_address',
    coalesce(p_order->>'note',''),(p_order->>'subtotal')::integer,
    (p_order->>'discount')::integer,(p_order->>'total')::integer,
    nullif(p_order->>'coupon_code',''),p_order->>'receipt_path',
    'Pending verification',true
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

create or replace function public.gdsb_set_order_status(
  p_reference text, p_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.gdsb_orders%rowtype;
  v_item record;
  v_product public.gdsb_products%rowtype;
  v_release boolean;
begin
  if p_status is null or p_status not in (
    'Pending verification','Payment confirmed','Payment not confirmed',
    'Preparing order','Out for delivery','Delivered','Cancelled'
  ) then
    raise exception using errcode='22023', message='INVALID_ORDER_STATUS';
  end if;
  select * into v_order from public.gdsb_orders
   where reference=p_reference for update;
  if not found then
    raise exception using errcode='P0001', message='ORDER_NOT_FOUND';
  end if;
  v_release := p_status in ('Payment not confirmed','Cancelled');

  if v_order.stock_reserved and v_release then
    for v_item in
      select product_id, sum(quantity)::integer as quantity
      from public.gdsb_order_items
      where order_id=v_order.id and product_id is not null
      group by product_id order by product_id
    loop
      update public.gdsb_products
       set stock_quantity=stock_quantity+v_item.quantity,updated_at=now()
       where id=v_item.product_id;
    end loop;
  elsif not v_order.stock_reserved and not v_release then
    -- A cancelled/rejected order must re-reserve before it becomes active.
    for v_item in
      select product_id, sum(quantity)::integer as quantity
      from public.gdsb_order_items
      where order_id=v_order.id
      group by product_id order by product_id
    loop
      if v_item.product_id is null then
        raise exception using errcode='P0001', message='STOCK_UNAVAILABLE';
      end if;
      select * into v_product from public.gdsb_products
       where id=v_item.product_id for update;
      if not found or v_product.hidden or not v_product.in_stock then
        raise exception using errcode='P0001', message='STOCK_UNAVAILABLE';
      end if;
      if v_product.stock_quantity<v_item.quantity then
        raise exception using errcode='P0001', message='INSUFFICIENT_STOCK';
      end if;
      update public.gdsb_products
       set stock_quantity=stock_quantity-v_item.quantity,updated_at=now()
       where id=v_item.product_id;
    end loop;
  end if;
  update public.gdsb_orders
    set status=p_status, stock_reserved=not v_release, updated_at=now(),
      payment_confirmed_at=case
        when p_status='Payment confirmed' then coalesce(payment_confirmed_at,now())
        when p_status in ('Payment not confirmed','Pending verification','Cancelled') then null
        else payment_confirmed_at end
    where id=v_order.id;
end
$function$;

-- Public schema is exposed by Supabase; these functions are ONLY callable by the
-- server-side service_role, with no browser role grants.
revoke all on function public.gdsb_place_order(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.gdsb_set_order_status(text,text) from public,anon,authenticated;
grant execute on function public.gdsb_place_order(jsonb,jsonb) to service_role;
grant execute on function public.gdsb_set_order_status(text,text) to service_role;
commit;
