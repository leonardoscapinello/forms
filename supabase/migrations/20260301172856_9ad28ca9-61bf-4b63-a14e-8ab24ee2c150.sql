
-- Gallery folders for organizing uploaded files
CREATE TABLE public.gallery_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES public.gallery_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Gallery files
CREATE TABLE public.gallery_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  folder_id UUID REFERENCES public.gallery_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for gallery_folders
ALTER TABLE public.gallery_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gallery folders" ON public.gallery_folders
  FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own gallery folders" ON public.gallery_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gallery folders" ON public.gallery_folders
  FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own gallery folders" ON public.gallery_folders
  FOR DELETE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- RLS for gallery_files
ALTER TABLE public.gallery_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gallery files" ON public.gallery_files
  FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own gallery files" ON public.gallery_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gallery files" ON public.gallery_files
  FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own gallery files" ON public.gallery_files
  FOR DELETE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
