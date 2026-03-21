-- Run this in Supabase SQL Editor if you get "organization_id does not exist"
-- Adds the organization_id column to profiles if it was created before the column existed

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
