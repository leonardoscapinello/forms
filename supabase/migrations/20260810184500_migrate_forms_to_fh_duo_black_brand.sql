-- Migrate saved form defaults from the legacy visual identity.
-- Exact JSON string replacements preserve user-selected custom fonts and colors.
BEGIN;

UPDATE public.forms
SET data = replace(
             replace(
               replace(
                 replace(
                   replace(
                     replace(
                       replace(
                         replace(
                           replace(data::text, '"Borna"', '"FH Duo Display"'),
                           '"Inter"', '"FH Duo Display"'
                         ),
                         '"#A1E101"', '"#050505"'
                       ),
                       '"#6B8A2A"', '"#0A0A0A"'
                     ),
                     '"#203300"', '"#0A0A0A"'
                   ),
                   '"#B3AB86"', '"#0A0A0A"'
                 ),
                 '"#8A7D4A"', '"#27272A"'
               ),
               '"#6B5D2F"', '"#18181B"'
             ),
             '"#FAFAF6"', '"#FAFAFA"'
           )::jsonb
WHERE data::text LIKE '%"Borna"%'
   OR data::text LIKE '%"Inter"%'
   OR data::text LIKE '%"#A1E101"%'
   OR data::text LIKE '%"#6B8A2A"%'
   OR data::text LIKE '%"#203300"%'
   OR data::text LIKE '%"#B3AB86"%'
   OR data::text LIKE '%"#8A7D4A"%'
   OR data::text LIKE '%"#6B5D2F"%'
   OR data::text LIKE '%"#FAFAF6"%';

COMMIT;
