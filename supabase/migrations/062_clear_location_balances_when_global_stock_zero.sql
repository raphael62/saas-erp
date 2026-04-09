-- When products.stock_quantity becomes 0, remove ALL per-location rows for that product.
-- Previously the trigger only applied the delta on the default location, so other depots could
-- still show quantities after sales/purchases/transfers were reversed or stock was cleared.

-- One-time cleanup: balances left over while global stock is already zero
delete from public.inventory_location_balances b
using public.products p
where p.organization_id = b.organization_id
  and p.id = b.product_id
  and coalesce(p.stock_quantity, 0) = 0;

create or replace function public.sync_inventory_location_balance_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc_id public.locations.id%type;
  delta numeric(14, 2);
begin
  if tg_op = 'INSERT' then
    select l.id into loc_id
    from public.locations l
    where l.organization_id = new.organization_id
      and coalesce(l.is_active, true)
    order by l.code nulls last, l.name
    limit 1;

    if loc_id is null then
      return new;
    end if;

    insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
    values (new.organization_id, new.id, loc_id, coalesce(new.stock_quantity, 0))
    on conflict (organization_id, product_id, location_id)
    do update set
      quantity = excluded.quantity,
      updated_at = now();
    return new;
  end if;

  if tg_op = 'UPDATE' and (new.stock_quantity is not distinct from old.stock_quantity) then
    return new;
  end if;

  -- Global stock is zero: clear every depot row for this product (does not require a default location row).
  if tg_op = 'UPDATE' and coalesce(new.stock_quantity, 0) = 0 then
    delete from public.inventory_location_balances
    where organization_id = new.organization_id
      and product_id = new.id;
    return new;
  end if;

  select l.id into loc_id
  from public.locations l
  where l.organization_id = new.organization_id
    and coalesce(l.is_active, true)
  order by l.code nulls last, l.name
  limit 1;

  if loc_id is null then
    return new;
  end if;

  delta := coalesce(new.stock_quantity, 0) - coalesce(old.stock_quantity, 0);
  if delta = 0 then
    return new;
  end if;

  insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
  values (new.organization_id, new.id, loc_id, delta)
  on conflict (organization_id, product_id, location_id)
  do update set
    quantity = public.inventory_location_balances.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;
