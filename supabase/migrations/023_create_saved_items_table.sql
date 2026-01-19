-- Create generic saved_items table for saving events, posts, plans, spots, etc.
-- Replaces/supplements saved_events with a more flexible structure

CREATE TABLE IF NOT EXISTS public.saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('event', 'post', 'plan', 'spot', 'drop')),
  item_id UUID NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT, -- Optional user notes about why they saved this
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user ON public.saved_items(user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_items_item ON public.saved_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_type ON public.saved_items(user_id, item_type, saved_at DESC);

-- Enable RLS
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own saved items" ON public.saved_items;
CREATE POLICY "Users can view own saved items" ON public.saved_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save items" ON public.saved_items;
CREATE POLICY "Users can save items" ON public.saved_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave items" ON public.saved_items;
CREATE POLICY "Users can unsave items" ON public.saved_items
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own saved items" ON public.saved_items;
CREATE POLICY "Users can update own saved items" ON public.saved_items
  FOR UPDATE USING (auth.uid() = user_id);

-- Migrate existing saved_events to saved_items (if saved_events table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saved_events') THEN
    INSERT INTO public.saved_items (user_id, item_type, item_id, saved_at)
    SELECT user_id, 'event', event_id, COALESCE(saved_at, NOW())
    FROM public.saved_events
    ON CONFLICT (user_id, item_type, item_id) DO NOTHING;
  END IF;
END $$;
