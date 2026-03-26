-- Per-user navbar / accent color (hex #RRGGBB), applied in dashboard layout.
alter table public.profiles add column if not exists theme_accent_hex text;

comment on column public.profiles.theme_accent_hex is
  'Optional #RRGGBB override for --navbar; null uses app default from globals.css.';
