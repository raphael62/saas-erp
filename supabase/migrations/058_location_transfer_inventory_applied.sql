-- Track whether a location transfer's lines have been applied to inventory_location_balances,
-- so edits/deletes reverse only when a prior apply actually ran (avoids bogus moves for legacy rows).

alter table public.location_transfers
  add column if not exists inventory_balances_applied boolean not null default false;

comment on column public.location_transfers.inventory_balances_applied is
  'True after this transfer''s line quantities were applied to inventory_location_balances.';
