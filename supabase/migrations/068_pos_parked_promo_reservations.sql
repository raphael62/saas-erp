-- Reserve promotion reward cartons when a sale is parked; released on parked cart delete
-- or moved to consumed_cartons on POS checkout. Budget remaining = promo_budget_cartons
-- - consumed_cartons - sum(reserved_cartons for active parked carts).

create table if not exists public.pos_parked_promo_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pos_parked_cart_id uuid not null references public.pos_parked_carts(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  reserved_cartons numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pos_parked_cart_id, promotion_id)
);

create index if not exists idx_pos_parked_promo_res_org_promo
  on public.pos_parked_promo_reservations (organization_id, promotion_id);

create index if not exists idx_pos_parked_promo_res_cart
  on public.pos_parked_promo_reservations (pos_parked_cart_id);

alter table public.pos_parked_promo_reservations enable row level security;

drop policy if exists "pos_parked_promo_reservations_select" on public.pos_parked_promo_reservations;
create policy "pos_parked_promo_reservations_select" on public.pos_parked_promo_reservations
  for select using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_promo_reservations_insert" on public.pos_parked_promo_reservations;
create policy "pos_parked_promo_reservations_insert" on public.pos_parked_promo_reservations
  for insert with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_promo_reservations_update" on public.pos_parked_promo_reservations;
create policy "pos_parked_promo_reservations_update" on public.pos_parked_promo_reservations
  for update using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  )
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop policy if exists "pos_parked_promo_reservations_delete" on public.pos_parked_promo_reservations;
create policy "pos_parked_promo_reservations_delete" on public.pos_parked_promo_reservations
  for delete using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

drop trigger if exists trg_pos_parked_promo_res_updated_at on public.pos_parked_promo_reservations;
create trigger trg_pos_parked_promo_res_updated_at
before update on public.pos_parked_promo_reservations
for each row execute function public.set_promotions_updated_at();

select pg_notify('pgrst', 'reload schema');
