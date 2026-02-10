
-- Create forms table to persist form data in the cloud
CREATE TABLE public.forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Formulário sem título',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own forms
CREATE POLICY "Users can view own forms" ON public.forms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own forms" ON public.forms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own forms" ON public.forms FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own forms" ON public.forms FOR DELETE USING (auth.uid() = user_id);

-- Admins can manage all forms
CREATE POLICY "Admins can manage all forms" ON public.forms FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
