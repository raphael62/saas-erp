-- Backfill inventory_location_balances for products that have no per-location rows yet.
-- Typical causes: migration 055 ran before any locations existed, or products were created before balances were wired.
-- Aligns with sync_inventory_location_balance_from_product: first active location (code nulls last, then name).

insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
select
  p.organization_id,
  p.id,
  loc.id,
  coalesce(p.stock_quantity, 0)
from public.products p
inner join lateral (
  select l.id
  from public.locations l
  where l.organization_id = p.organization_id
    and coalesce(l.is_active, true)
  order by l.code nulls last, l.name
  limit 1
) loc on true
where not exists (
  select 1
  from public.inventory_location_balances b
  where b.organization_id = p.organization_id
    and b.product_id = p.id
)
on conflict (organization_id, product_id, location_id) do update set
  quantity = excluded.quantity,
  updated_at = now();
