-- 1) Single source of truth for "default" inventory location (must match
--    sync_inventory_location_balance_from_product in 055_inventory_location_balances.sql).
-- 2) Reconcile default-location rows so sum(per-location quantities) = products.stock_quantity.

create or replace function public.get_default_inventory_location_id(p_organization_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select l.id
  from public.locations l
  where l.organization_id = p_organization_id
    and coalesce(l.is_active, true)
  order by l.code nulls last, l.name
  limit 1;
$$;

grant execute on function public.get_default_inventory_location_id(uuid) to authenticated;
grant execute on function public.get_default_inventory_location_id(uuid) to service_role;

-- Set each product's default-location balance to (global stock − sum(non-default locations)).
with defloc as (
  select distinct on (organization_id)
    organization_id,
    id as default_location_id
  from public.locations
  where coalesce(is_active, true)
  order by organization_id, code nulls last, name
),
agg as (
  select
    p.organization_id,
    p.id as product_id,
    coalesce(p.stock_quantity, 0) as gq,
    d.default_location_id,
    coalesce(
      sum(b.quantity) filter (where b.location_id is distinct from d.default_location_id),
      0
    ) as others_sum
  from public.products p
  inner join defloc d on d.organization_id = p.organization_id
  left join public.inventory_location_balances b
    on b.organization_id = p.organization_id
    and b.product_id = p.id
  group by p.organization_id, p.id, p.stock_quantity, d.default_location_id
)
insert into public.inventory_location_balances (organization_id, product_id, location_id, quantity)
select
  organization_id,
  product_id,
  default_location_id,
  greatest(0, round((gq - others_sum)::numeric, 2))
from agg
on conflict (organization_id, product_id, location_id) do update set
  quantity = excluded.quantity,
  updated_at = now();
