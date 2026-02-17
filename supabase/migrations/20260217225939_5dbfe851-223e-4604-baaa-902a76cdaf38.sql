
-- Tags table: persistent tags, managed globally
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read tags
CREATE POLICY "Authenticated users can view tags"
  ON public.tags FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can create/update/delete tags
CREATE POLICY "Admins can manage tags"
  ON public.tags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Form-tags junction table
CREATE TABLE public.form_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (form_id, tag_id)
);

ALTER TABLE public.form_tags ENABLE ROW LEVEL SECURITY;

-- Users can view tags on their own forms; admins see all
CREATE POLICY "Users can view own form tags"
  ON public.form_tags FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can manage tags on own forms"
  ON public.form_tags FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can remove tags from own forms"
  ON public.form_tags FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );
