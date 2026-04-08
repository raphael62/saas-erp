-- Stock count sheets: status field removed (not needed).

alter table public.stock_count_sheets drop column if exists status;
