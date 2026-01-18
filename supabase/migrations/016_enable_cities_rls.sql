-- Enable RLS on cities table and add policies
-- Cities are public data that everyone should be able to read

-- Enable Row Level Security
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read cities (public data)
DROP POLICY IF EXISTS "Cities are viewable by everyone" ON public.cities;
CREATE POLICY "Cities are viewable by everyone" ON public.cities
  FOR SELECT USING (true);

-- Policy: Only authenticated users can insert cities (for admin/organizer use)
DROP POLICY IF EXISTS "Authenticated users can create cities" ON public.cities;
CREATE POLICY "Authenticated users can create cities" ON public.cities
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy: Only authenticated users can update cities
DROP POLICY IF EXISTS "Authenticated users can update cities" ON public.cities;
CREATE POLICY "Authenticated users can update cities" ON public.cities
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Note: We don't allow DELETE on cities to prevent accidental data loss
-- If deletion is needed, it should be done via service role or admin
