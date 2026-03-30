-- Org billing: tier, Stripe ids, trial and subscription periods (synced from Stripe webhooks).

alter table public.organizations
  add column if not exists subscription_tier text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.organizations
  drop constraint if exists org_subscription_tier_check;

alter table public.organizations
  add constraint org_subscription_tier_check
  check (
    subscription_tier is null
    or subscription_tier in ('starter', 'growth', 'business', 'enterprise')
  );

-- Replace registration RPC: optional tier stored on new org (validated).
drop function if exists public.start_registration(text, text);

create or replace function public.start_registration(
  p_company_name text,
  p_phone text default null,
  p_subscription_tier text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_org_id uuid;
  v_attempt int := 0;
  v_tier text;
begin
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Company name is required';
  end if;

  v_tier := null;
  if p_subscription_tier is not null and trim(p_subscription_tier) <> '' then
    v_tier := lower(trim(p_subscription_tier));
    if v_tier not in ('starter', 'growth', 'business', 'enterprise') then
      raise exception 'Invalid subscription tier';
    end if;
  end if;

  loop
    v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');
    begin
      insert into public.organizations (name, phone, code, created_by, subscription_tier)
      values (trim(p_company_name), nullif(trim(p_phone), ''), v_code, null, v_tier)
      returning id into v_org_id;
      return json_build_object('org_id', v_org_id, 'code', v_code);
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 10 then
        raise exception 'Could not generate unique code';
      end if;
    end;
  end loop;
end;
$$;

grant execute on function public.start_registration(text, text, text) to anon;
grant execute on function public.start_registration(text, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
