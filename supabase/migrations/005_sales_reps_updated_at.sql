-- Add updated_at tracking for sales reps.
-- Safe to run multiple times.

alter table public.sales_reps
  add column if not exists updated_at timestamptz default now();

update public.sales_reps
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.set_sales_reps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_reps_updated_at on public.sales_reps;
create trigger trg_sales_reps_updated_at
before update on public.sales_reps
for each row
execute function public.set_sales_reps_updated_at();
