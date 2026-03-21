-- Run this in Supabase SQL Editor if you already created empties_receive_lines.
-- Adds the sold_qty column.

alter table public.empties_receive_lines
  add column if not exists sold_qty numeric(14, 4) not null default 0;
