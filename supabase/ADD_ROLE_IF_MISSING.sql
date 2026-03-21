-- Run this if your profiles table was created before the role column existed.
-- Adds role column with default 'member' (sees all menus).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';
