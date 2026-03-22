-- Add phone to organizations (head office contact)
alter table public.organizations add column if not exists phone text;
