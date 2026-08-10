-- Align the former dark-slate default accent with the new black identity.
UPDATE public.forms
SET data = replace(data::text, '"220 18% 20%"', '"0 0% 4%"')::jsonb
WHERE data::text LIKE '%"220 18% 20%"%';
