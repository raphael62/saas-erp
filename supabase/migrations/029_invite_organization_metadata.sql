-- When users sign up via invite, set organization_id from metadata
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    (new.raw_user_meta_data->>'organization_id')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;
