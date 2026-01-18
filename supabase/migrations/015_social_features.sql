-- Social Features Migration
-- Adds follow system, event attendees, user posts, direct messages, and groups

-- ============================================================================
-- FOLLOWS SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id) -- Can't follow yourself
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- ============================================================================
-- EVENT ATTENDEES (Going Together)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'interested', 'maybe')),
  is_public BOOLEAN DEFAULT true, -- Privacy control
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON public.event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON public.event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_status ON public.event_attendees(status);

-- ============================================================================
-- USER POSTS (Social Feed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_posts_user ON public.user_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_posts_event ON public.user_posts(event_id);
CREATE INDEX IF NOT EXISTS idx_user_posts_created ON public.user_posts(created_at DESC);

-- Post likes
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id UUID REFERENCES public.user_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON public.post_likes(user_id);

-- Post comments
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.user_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user ON public.post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created ON public.post_comments(created_at DESC);

-- ============================================================================
-- DIRECT MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id != recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_sender ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON public.direct_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_dm_created ON public.direct_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(sender_id, recipient_id, created_at DESC);

-- ============================================================================
-- EVENT REVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- One review per user per event
);

CREATE INDEX IF NOT EXISTS idx_event_reviews_event ON public.event_reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_user ON public.event_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_rating ON public.event_reviews(rating);

-- ============================================================================
-- GROUPS/COMMUNITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  city_id TEXT REFERENCES public.cities(id),
  category TEXT, -- e.g., 'techno', 'hardcore', 'general'
  is_private BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_city ON public.groups(city_id);
CREATE INDEX IF NOT EXISTS idx_groups_category ON public.groups(category);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);

-- Group members
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'moderator')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);

-- ============================================================================
-- TRIGGERS FOR COUNTS
-- ============================================================================

-- Update post likes count
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_posts 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_posts 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_post_likes_count ON public.post_likes;
CREATE TRIGGER trigger_update_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Update post comments count
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_posts 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_posts 
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_post_comments_count ON public.post_comments;
CREATE TRIGGER trigger_update_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

-- Update event attendees count in events.counts
CREATE OR REPLACE FUNCTION update_event_attendees_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events 
    SET counts = jsonb_set(
      COALESCE(counts, '{}'::jsonb),
      '{rsvpGoing}',
      to_jsonb(COALESCE((counts->>'rsvpGoing')::int, 0) + CASE WHEN NEW.status = 'going' THEN 1 ELSE 0 END)
    )
    WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.events 
    SET counts = jsonb_set(
      COALESCE(counts, '{}'::jsonb),
      '{rsvpGoing}',
      to_jsonb(GREATEST(COALESCE((counts->>'rsvpGoing')::int, 0) - CASE WHEN OLD.status = 'going' THEN 1 ELSE 0 END, 0))
    )
    WHERE id = OLD.event_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes
    IF OLD.status = 'going' AND NEW.status != 'going' THEN
      UPDATE public.events 
      SET counts = jsonb_set(
        COALESCE(counts, '{}'::jsonb),
        '{rsvpGoing}',
        to_jsonb(GREATEST(COALESCE((counts->>'rsvpGoing')::int, 0) - 1, 0))
      )
      WHERE id = NEW.event_id;
    ELSIF OLD.status != 'going' AND NEW.status = 'going' THEN
      UPDATE public.events 
      SET counts = jsonb_set(
        COALESCE(counts, '{}'::jsonb),
        '{rsvpGoing}',
        to_jsonb(COALESCE((counts->>'rsvpGoing')::int, 0) + 1)
      )
      WHERE id = NEW.event_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_event_attendees_count ON public.event_attendees;
CREATE TRIGGER trigger_update_event_attendees_count
  AFTER INSERT OR UPDATE OR DELETE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION update_event_attendees_count();

-- Update group member count
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups 
    SET member_count = member_count + 1 
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups 
    SET member_count = GREATEST(member_count - 1, 0)
    WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_group_member_count ON public.group_members;
CREATE TRIGGER trigger_update_group_member_count
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all follows" ON public.follows;
CREATE POLICY "Users can view all follows" ON public.follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own follows" ON public.follows;
CREATE POLICY "Users can create their own follows" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can delete their own follows" ON public.follows;
CREATE POLICY "Users can delete their own follows" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Event Attendees
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view public attendees" ON public.event_attendees;
CREATE POLICY "Users can view public attendees" ON public.event_attendees
  FOR SELECT USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.event_attendees;
CREATE POLICY "Users can manage their own attendance" ON public.event_attendees
  FOR ALL USING (auth.uid() = user_id);

-- User Posts
ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all posts" ON public.user_posts;
CREATE POLICY "Users can view all posts" ON public.user_posts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own posts" ON public.user_posts;
CREATE POLICY "Users can create their own posts" ON public.user_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own posts" ON public.user_posts;
CREATE POLICY "Users can update their own posts" ON public.user_posts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.user_posts;
CREATE POLICY "Users can delete their own posts" ON public.user_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Post Likes
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all post likes" ON public.post_likes;
CREATE POLICY "Users can view all post likes" ON public.post_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;
CREATE POLICY "Users can like posts" ON public.post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.post_likes;
CREATE POLICY "Users can unlike their own likes" ON public.post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Post Comments
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all comments" ON public.post_comments;
CREATE POLICY "Users can view all comments" ON public.post_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create comments" ON public.post_comments;
CREATE POLICY "Users can create comments" ON public.post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.post_comments;
CREATE POLICY "Users can update their own comments" ON public.post_comments
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.post_comments;
CREATE POLICY "Users can delete their own comments" ON public.post_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Direct Messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own messages" ON public.direct_messages;
CREATE POLICY "Users can view their own messages" ON public.direct_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.direct_messages;
CREATE POLICY "Users can send messages" ON public.direct_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update their received messages" ON public.direct_messages;
CREATE POLICY "Users can update their received messages" ON public.direct_messages
  FOR UPDATE USING (auth.uid() = recipient_id);

-- Event Reviews
ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all reviews" ON public.event_reviews;
CREATE POLICY "Users can view all reviews" ON public.event_reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON public.event_reviews;
CREATE POLICY "Users can create reviews" ON public.event_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON public.event_reviews;
CREATE POLICY "Users can update their own reviews" ON public.event_reviews
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.event_reviews;
CREATE POLICY "Users can delete their own reviews" ON public.event_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view public groups" ON public.groups;
CREATE POLICY "Users can view public groups" ON public.groups
  FOR SELECT USING (is_private = false OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Group creators can update groups" ON public.groups;
CREATE POLICY "Group creators can update groups" ON public.groups
  FOR UPDATE USING (auth.uid() = created_by);

-- Group Members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view group members" ON public.group_members;
CREATE POLICY "Users can view group members" ON public.group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.groups 
      WHERE id = group_id 
      AND (is_private = false OR created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups" ON public.group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
CREATE POLICY "Users can leave groups" ON public.group_members
  FOR DELETE USING (auth.uid() = user_id);
