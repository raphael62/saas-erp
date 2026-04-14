-- Order POS-style invoice numbers (yyyymmdd + numeric suffix) by numeric suffix, not lexicographic string order.
create or replace function public.next_sales_invoice_seq_for_prefix(
  p_organization_id uuid,
  p_prefix text
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_max int;
begin
  if p_organization_id is distinct from public.get_my_org_id() then
    raise exception 'organization mismatch';
  end if;

  select coalesce(max(
    case
      when length(si.invoice_no) > length(p_prefix)
        and substr(si.invoice_no, 1, length(p_prefix)) = p_prefix
        and substr(si.invoice_no, length(p_prefix) + 1) ~ '^[0-9]+$'
      then substr(si.invoice_no, length(p_prefix) + 1)::int
      else null::int
    end
  ), 0)
  into v_max
  from public.sales_invoices si
  where si.organization_id = p_organization_id
    and si.invoice_no ilike p_prefix || '%';

  return v_max + 1;
end;
$$;
