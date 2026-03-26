-- Subscription display in app header (days remaining until renewal / end).
alter table public.organizations add column if not exists subscription_ends_at timestamptz;

comment on column public.organizations.subscription_ends_at is
  'End of current subscription period (UTC). Null = not set / open-ended; app hides days-left when null.';
