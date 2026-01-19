-- Organizations and Event Check-ins Migration
-- Adds organizations table for event curators/promoters and check-in functionality

-- ============================================================================
-- ORGANIZATIONS (Event Curators/Promoters)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-friendly name (e.g., "whats-the-move-vancouver")
  description TEXT,
  city_id TEXT REFERENCES public.cities(id),
  logo_url TEXT,
  cover_image_url TEXT,
  website_url TEXT,
  instagram_handle TEXT,
  twitter_handle TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT false,
  event_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_city ON public.organizations(city_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

-- Organization members (who can create events for the organization)
CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- Organization followers (users who follow organizations)
CREATE TABLE IF NOT EXISTS public.organization_followers (
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_followers_org ON public.organization_followers(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_followers_user ON public.organization_followers(user_id);

-- Update events table to link to organizations
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_organization ON public.events(organization_id);

-- ============================================================================
-- EVENT CHECK-INS
-- ============================================================================

-- Add checked_in_at timestamp to event_attendees table
ALTER TABLE public.event_attendees 
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_event_attendees_checked_in ON public.event_attendees(checked_in_at) 
WHERE checked_in_at IS NOT NULL;

-- Function to update organization event count
CREATE OR REPLACE FUNCTION update_organization_event_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NOT NULL THEN
    UPDATE public.organizations 
    SET event_count = event_count + 1 
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' AND OLD.organization_id IS NOT NULL THEN
    UPDATE public.organizations 
    SET event_count = GREATEST(event_count - 1, 0)
    WHERE id = OLD.organization_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    -- Event moved to different organization
    IF OLD.organization_id IS NOT NULL THEN
      UPDATE public.organizations 
      SET event_count = GREATEST(event_count - 1, 0)
      WHERE id = OLD.organization_id;
    END IF;
    IF NEW.organization_id IS NOT NULL THEN
      UPDATE public.organizations 
      SET event_count = event_count + 1 
      WHERE id = NEW.organization_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_org_event_count ON public.events;
CREATE TRIGGER trigger_update_org_event_count
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_organization_event_count();

-- Function to update organization follower count
CREATE OR REPLACE FUNCTION update_organization_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.organizations 
    SET follower_count = follower_count + 1 
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.organizations 
    SET follower_count = GREATEST(follower_count - 1, 0)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_org_follower_count ON public.organization_followers;
CREATE TRIGGER trigger_update_org_follower_count
  AFTER INSERT OR DELETE ON public.organization_followers
  FOR EACH ROW EXECUTE FUNCTION update_organization_follower_count();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_followers ENABLE ROW LEVEL SECURITY;

-- Organizations: Everyone can read, authenticated users can create
DROP POLICY IF EXISTS "Organizations are viewable by everyone" ON public.organizations;
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Organization admins can update organizations" ON public.organizations;
CREATE POLICY "Organization admins can update organizations" ON public.organizations
  FOR UPDATE USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organizations.id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- Organization members: Members can view, admins can manage
DROP POLICY IF EXISTS "Organization members are viewable by everyone" ON public.organization_members;
CREATE POLICY "Organization members are viewable by everyone" ON public.organization_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organization admins can add members" ON public.organization_members;
CREATE POLICY "Organization admins can add members" ON public.organization_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_members.organization_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Users can join organizations" ON public.organization_members;
CREATE POLICY "Users can join organizations" ON public.organization_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organization admins can remove members" ON public.organization_members;
CREATE POLICY "Organization admins can remove members" ON public.organization_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_members.organization_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
    OR auth.uid() = organization_members.user_id -- Users can leave themselves
  );

-- Organization followers: Everyone can view, users can follow/unfollow
DROP POLICY IF EXISTS "Organization followers are viewable by everyone" ON public.organization_followers;
CREATE POLICY "Organization followers are viewable by everyone" ON public.organization_followers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow organizations" ON public.organization_followers;
CREATE POLICY "Users can follow organizations" ON public.organization_followers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unfollow organizations" ON public.organization_followers;
CREATE POLICY "Users can unfollow organizations" ON public.organization_followers
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp for organizations
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
