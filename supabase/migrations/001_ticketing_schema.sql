-- Inner City Ticketing Schema
-- Postgres schema for events, tickets, inventory, scanning, and moderation

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Create ENUM types if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organizer_tier') THEN
    CREATE TYPE organizer_tier AS ENUM ('community', 'official');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('draft', 'active', 'under_review', 'removed', 'cancelled', 'completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM ('active', 'used', 'refunded', 'transferred', 'revoked', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_type') THEN
    CREATE TYPE ticket_type AS ENUM ('ga', 'vip', 'early_bird');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scan_result') THEN
    CREATE TYPE scan_result AS ENUM ('valid', 'invalid', 'already_used', 'expired', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN
    CREATE TYPE transfer_status AS ENUM ('pending', 'completed', 'cancelled', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('pending', 'under_review', 'resolved', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
    CREATE TYPE report_type AS ENUM ('fraud', 'inappropriate_content', 'scam', 'other');
  END IF;
END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Cities (reference data)
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2 (e.g., 'CA', 'US')
  timezone TEXT NOT NULL,
  coordinates POINT, -- PostGIS point (lat, lng)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, country_code)
);

-- Handle existing cities table (may have different schema)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cities') THEN
    -- Check if country_code column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'cities' AND column_name = 'country_code'
    ) THEN
      -- New schema - add missing columns
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS timezone TEXT;
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS coordinates POINT;
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      
      -- Create indexes only if column exists
      CREATE INDEX IF NOT EXISTS idx_cities_country_code ON cities(country_code);
    ELSE
      -- Old schema - add new columns with defaults
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'US';
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS coordinates POINT;
      ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      
      -- Create indexes after adding columns
      CREATE INDEX IF NOT EXISTS idx_cities_country_code ON cities(country_code);
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);
  ELSE
    -- Table doesn't exist, indexes will be created after table creation
    CREATE INDEX IF NOT EXISTS idx_cities_country_code ON cities(country_code);
    CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name);
  END IF;
END $$;

-- Organizers (users who create events)
CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  tier organizer_tier DEFAULT 'community' NOT NULL,
  stripe_connect_account_id TEXT UNIQUE, -- For official organizers with payments
  verification_status TEXT CHECK (verification_status IN ('unverified', 'pending', 'verified')) DEFAULT 'unverified',
  payout_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (tier = 'official' OR stripe_connect_account_id IS NULL) -- Only official can have Stripe
);

CREATE INDEX IF NOT EXISTS idx_organizers_tier ON organizers(tier);
CREATE INDEX IF NOT EXISTS idx_organizers_verification ON organizers(verification_status);

-- Events
-- Handle existing events table with old schema (TEXT city_id, TEXT organizer_id)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    -- Table doesn't exist, create it with new schema
    CREATE TABLE events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
      city_id UUID NOT NULL, -- Foreign key added conditionally below
      title TEXT NOT NULL,
      short_desc TEXT,
      long_desc TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      venue_name TEXT NOT NULL,
      address TEXT,
      coordinates POINT, -- PostGIS point for venue location
      categories TEXT[], -- Array of category tags
      media_urls TEXT[], -- Array of image URLs
      status event_status DEFAULT 'draft' NOT NULL,
      tier organizer_tier NOT NULL, -- Denormalized from organizer for performance
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (end_at > start_at)
    );
  ELSE
    -- Table exists - add missing columns if needed
    -- Check if organizer_id is TEXT (old schema)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'organizer_id'
      AND data_type IN ('text', 'character varying')
    ) THEN
      -- Old schema - skip organizer_id FK, it's TEXT
      NULL;
    ELSE
      -- New schema or organizer_id doesn't exist - add it if missing
      ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id UUID;
      -- Only add FK if organizers table exists and organizer_id is UUID
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'organizer_id'
        AND data_type = 'uuid'
      ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizers') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'events' 
          AND constraint_name = 'events_organizer_id_fkey'
        ) THEN
          BEGIN
            ALTER TABLE events ADD CONSTRAINT events_organizer_id_fkey 
              FOREIGN KEY (organizer_id) REFERENCES organizers(id) ON DELETE CASCADE;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        END IF;
      END IF;
    END IF;
    
    -- Handle city_id - add if missing, but don't add FK if types don't match
    ALTER TABLE events ADD COLUMN IF NOT EXISTS city_id UUID;
    
    -- Add other missing columns
    ALTER TABLE events ADD COLUMN IF NOT EXISTS short_desc TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS long_desc TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_name TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS coordinates POINT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS categories TEXT[];
    ALTER TABLE events ADD COLUMN IF NOT EXISTS media_urls TEXT[];
    ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Handle cities table foreign key (may have TEXT or UUID id)
-- Also handle events table city_id column type
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    -- Check if events.city_id exists and what type it is
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'city_id'
    ) THEN
      -- Check if city_id is TEXT (old schema)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'city_id'
        AND data_type IN ('text', 'character varying')
      ) THEN
        -- Old schema - city_id is TEXT, skip FK constraint
        NULL;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'city_id'
        AND data_type = 'uuid'
      ) THEN
        -- New schema - city_id is UUID, check cities table
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cities') THEN
          -- Check if cities.id is UUID
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'cities' 
            AND column_name = 'id' 
            AND data_type = 'uuid'
          ) THEN
            -- Cities has UUID id - add foreign key constraint
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints 
              WHERE table_name = 'events' 
              AND constraint_name = 'events_city_id_fkey'
            ) THEN
              BEGIN
                ALTER TABLE events ADD CONSTRAINT events_city_id_fkey 
                  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT;
              EXCEPTION WHEN OTHERS THEN
                -- Constraint might fail if data doesn't match, skip it
                NULL;
              END;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_tier ON events(tier);
CREATE INDEX IF NOT EXISTS idx_events_city_start ON events(city_id, start_at) WHERE status = 'active';

-- Ticket Inventory (prevents overselling)
CREATE TABLE IF NOT EXISTS ticket_inventory (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  total_capacity INTEGER NOT NULL CHECK (total_capacity > 0),
  sold_count INTEGER DEFAULT 0 NOT NULL CHECK (sold_count >= 0),
  reserved_count INTEGER DEFAULT 0 NOT NULL CHECK (reserved_count >= 0),
  available_count INTEGER GENERATED ALWAYS AS (total_capacity - sold_count - reserved_count) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sold_count + reserved_count <= total_capacity)
);

CREATE INDEX IF NOT EXISTS idx_inventory_available ON ticket_inventory(available_count) WHERE available_count > 0;

-- Ticket Types (for future expansion beyond GA)
CREATE TABLE IF NOT EXISTS ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type ticket_type NOT NULL DEFAULT 'ga',
  name TEXT NOT NULL, -- e.g., "General Admission", "VIP"
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  sold_count INTEGER DEFAULT 0 NOT NULL CHECK (sold_count >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, type)
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_active ON ticket_types(event_id, is_active) WHERE is_active = TRUE;

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transfer_from_id UUID REFERENCES auth.users(id), -- NULL if original purchase
  qr_secret TEXT NOT NULL UNIQUE, -- Cryptographic secret for QR generation
  qr_rotation_nonce INTEGER DEFAULT 0 NOT NULL, -- Increments for time-based rotation
  status ticket_status DEFAULT 'active' NOT NULL,
  purchase_price_cents INTEGER NOT NULL CHECK (purchase_price_cents >= 0),
  stripe_payment_intent_id TEXT UNIQUE, -- Links to Stripe payment
  purchased_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ, -- Auto-expire after event ends
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > purchased_at),
  CHECK (status != 'revoked' OR revoked_at IS NOT NULL)
);

-- Handle existing tickets table with old schema (user_id instead of buyer_id)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets') THEN
    -- Check if old schema (user_id exists, buyer_id doesn't)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'user_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'buyer_id'
    ) THEN
      -- Rename user_id to buyer_id
      ALTER TABLE tickets RENAME COLUMN user_id TO buyer_id;
    END IF;
    
    -- Add missing columns
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type_id UUID;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transfer_from_id UUID;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_rotation_nonce INTEGER DEFAULT 0;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchase_price_cents INTEGER DEFAULT 0;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Handle qr_secret: ensure it's NOT NULL and UNIQUE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'qr_secret'
    ) THEN
      -- Make qr_secret NOT NULL if it's nullable
      BEGIN
        ALTER TABLE tickets ALTER COLUMN qr_secret SET NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      
      -- Add unique constraint if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'tickets' AND constraint_name = 'tickets_qr_secret_key'
      ) THEN
        BEGIN
          ALTER TABLE tickets ADD CONSTRAINT tickets_qr_secret_key UNIQUE (qr_secret);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
    
    -- Handle status: ensure it uses ticket_status enum
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tickets' AND column_name = 'status'
      AND data_type = 'text'
    ) THEN
      -- Try to convert TEXT status to ticket_status enum
      BEGIN
        ALTER TABLE tickets ALTER COLUMN status TYPE ticket_status USING status::ticket_status;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_buyer ON tickets(buyer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_secret ON tickets(qr_secret);
CREATE INDEX IF NOT EXISTS idx_tickets_transfer_from ON tickets(transfer_from_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_expires ON tickets(expires_at) WHERE expires_at IS NOT NULL;

-- Payments (reconciliation)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= 0),
  organizer_payout_cents INTEGER NOT NULL CHECK (organizer_payout_cents >= 0),
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_connect_account_id TEXT NOT NULL, -- Organizer's Stripe Connect account
  status TEXT CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')) DEFAULT 'pending' NOT NULL,
  chargeback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount_cents = platform_fee_cents + organizer_payout_cents)
);

CREATE INDEX IF NOT EXISTS idx_payments_ticket ON payments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_payments_event ON payments(event_id);
CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_organizer ON payments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ============================================================================
-- TRANSFER & AUDIT TABLES
-- ============================================================================

-- Ticket Transfers (audit trail)
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transfer_price_cents INTEGER DEFAULT 0 CHECK (transfer_price_cents >= 0),
  status transfer_status DEFAULT 'pending' NOT NULL,
  stripe_transfer_payment_intent_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_reason TEXT,
  CHECK (from_user_id != to_user_id),
  CHECK (status != 'completed' OR completed_at IS NOT NULL),
  CHECK (status != 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_transfers_ticket ON ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_user ON ticket_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_user ON ticket_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON ticket_transfers(status);

-- ============================================================================
-- SCANNING TABLES
-- ============================================================================

-- Check-in Logs (immutable audit trail)
CREATE TABLE IF NOT EXISTS check_in_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scanner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, -- Staff member
  scanner_device_id TEXT, -- Device identifier for fraud detection
  qr_secret TEXT NOT NULL, -- Snapshot of QR at check-in time
  qr_nonce INTEGER NOT NULL, -- Snapshot of nonce
  result scan_result NOT NULL,
  reason TEXT, -- Additional context (e.g., "Ticket already used at 2024-01-15 20:30:00")
  location_lat DECIMAL(10, 8), -- Optional GPS
  location_lng DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CHECK (result = 'valid' OR reason IS NOT NULL) -- Invalid scans must have reason
);

CREATE INDEX IF NOT EXISTS idx_check_in_logs_ticket ON check_in_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_event ON check_in_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_scanner ON check_in_logs(scanner_user_id);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_device ON check_in_logs(scanner_device_id);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_result ON check_in_logs(result);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_created_at ON check_in_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_event_created ON check_in_logs(event_id, created_at);

-- Scanner Devices (for fraud detection)
CREATE TABLE IF NOT EXISTS scanner_devices (
  id TEXT PRIMARY KEY, -- Device identifier
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanner_devices_user ON scanner_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_scanner_devices_last_seen ON scanner_devices(last_seen_at);

-- ============================================================================
-- MODERATION TABLES
-- ============================================================================

-- Event Reports
CREATE TABLE IF NOT EXISTS event_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type report_type NOT NULL,
  description TEXT NOT NULL,
  status report_status DEFAULT 'pending' NOT NULL,
  reviewed_by UUID REFERENCES auth.users(id), -- Admin who reviewed
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_reports_event ON event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_reporter ON event_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_status ON event_reports(status);
CREATE INDEX IF NOT EXISTS idx_event_reports_type ON event_reports(report_type);

-- Event Status History (audit trail for status changes)
CREATE TABLE event_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  old_status event_status,
  new_status event_status NOT NULL,
  changed_by UUID REFERENCES auth.users(id), -- NULL if system/automatic
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_status_history_event ON event_status_history(event_id);
CREATE INDEX IF NOT EXISTS idx_event_status_history_created ON event_status_history(created_at);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_event_reports_updated_at ON event_reports;
CREATE TRIGGER update_event_reports_updated_at BEFORE UPDATE ON event_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Track event status changes
CREATE OR REPLACE FUNCTION track_event_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO event_status_history (event_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS track_event_status_trigger ON events;
CREATE TRIGGER track_event_status_trigger AFTER UPDATE OF status ON events
  FOR EACH ROW EXECUTE FUNCTION track_event_status_change();

-- Update inventory sold_count when ticket status changes
CREATE OR REPLACE FUNCTION update_inventory_on_ticket_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When ticket becomes 'used', increment sold_count
  IF NEW.status = 'used' AND OLD.status != 'used' THEN
    UPDATE ticket_inventory
    SET sold_count = sold_count + 1
    WHERE event_id = NEW.event_id;
  END IF;
  
  -- When ticket is refunded, decrement sold_count
  IF NEW.status = 'refunded' AND OLD.status != 'refunded' THEN
    UPDATE ticket_inventory
    SET sold_count = GREATEST(0, sold_count - 1)
    WHERE event_id = NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_on_ticket_status_trigger ON tickets;
CREATE TRIGGER update_inventory_on_ticket_status_trigger AFTER UPDATE OF status ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_inventory_on_ticket_status();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanner_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_status_history ENABLE ROW LEVEL SECURITY;

-- Cities: Public read
DROP POLICY IF EXISTS "Cities are publicly readable" ON cities;
CREATE POLICY "Cities are publicly readable"
  ON cities FOR SELECT
  USING (true);

-- Organizers: Public read, own update
DROP POLICY IF EXISTS "Organizers are publicly readable" ON organizers;
CREATE POLICY "Organizers are publicly readable"
  ON organizers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Organizers can update own profile" ON organizers;
CREATE POLICY "Organizers can update own profile"
  ON organizers FOR UPDATE
  USING (auth.uid() = id);

-- Events: Public read active events, organizers can manage own
DROP POLICY IF EXISTS "Active events are publicly readable" ON events;
CREATE POLICY "Active events are publicly readable"
  ON events FOR SELECT
  USING (status = 'active' OR status = 'under_review');

-- Conditionally create organizer policies based on organizer_id type
DO $$ 
BEGIN
  -- Check if organizer_id is UUID (new schema) or TEXT (old schema)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' 
    AND column_name = 'organizer_id'
    AND data_type = 'uuid'
  ) THEN
    -- New schema - organizer_id is UUID
    DROP POLICY IF EXISTS "Organizers can view own events" ON events;
    CREATE POLICY "Organizers can view own events"
      ON events FOR SELECT
      USING (auth.uid() = organizer_id);

    DROP POLICY IF EXISTS "Organizers can create events" ON events;
    CREATE POLICY "Organizers can create events"
      ON events FOR INSERT
      WITH CHECK (auth.uid() = organizer_id);

    DROP POLICY IF EXISTS "Organizers can update own events" ON events;
    CREATE POLICY "Organizers can update own events"
      ON events FOR UPDATE
      USING (auth.uid() = organizer_id);
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' 
    AND column_name = 'organizer_id'
    AND data_type IN ('text', 'character varying')
  ) THEN
    -- Old schema - organizer_id is TEXT, cast auth.uid() to TEXT
    DROP POLICY IF EXISTS "Organizers can view own events" ON events;
    CREATE POLICY "Organizers can view own events"
      ON events FOR SELECT
      USING (auth.uid()::TEXT = organizer_id);

    DROP POLICY IF EXISTS "Organizers can create events" ON events;
    CREATE POLICY "Organizers can create events"
      ON events FOR INSERT
      WITH CHECK (auth.uid()::TEXT = organizer_id);

    DROP POLICY IF EXISTS "Organizers can update own events" ON events;
    CREATE POLICY "Organizers can update own events"
      ON events FOR UPDATE
      USING (auth.uid()::TEXT = organizer_id);
  END IF;
END $$;

-- Ticket Inventory: Public read, only service role can modify
DROP POLICY IF EXISTS "Inventory is publicly readable" ON ticket_inventory;
CREATE POLICY "Inventory is publicly readable"
  ON ticket_inventory FOR SELECT
  USING (true);

-- Tickets: Users can view own tickets, organizers can view event tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON tickets;
CREATE POLICY "Users can view own tickets"
  ON tickets FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = transfer_from_id);

DROP POLICY IF EXISTS "Organizers can view event tickets" ON tickets;
CREATE POLICY "Organizers can view event tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = tickets.event_id
      AND events.organizer_id = auth.uid()
    )
  );

-- Payments: Users can view own payments, organizers can view event payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Organizers can view event payments" ON payments;
CREATE POLICY "Organizers can view event payments"
  ON payments FOR SELECT
  USING (auth.uid() = organizer_id);

-- Ticket Transfers: Users can view transfers they're involved in
DROP POLICY IF EXISTS "Users can view own transfers" ON ticket_transfers;
CREATE POLICY "Users can view own transfers"
  ON ticket_transfers FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Check-in Logs: Public read (for transparency), only service role can insert
DROP POLICY IF EXISTS "Check-in logs are publicly readable" ON check_in_logs;
CREATE POLICY "Check-in logs are publicly readable"
  ON check_in_logs FOR SELECT
  USING (true);

-- Scanner Devices: Users can manage own devices
DROP POLICY IF EXISTS "Users can manage own scanner devices" ON scanner_devices;
CREATE POLICY "Users can manage own scanner devices"
  ON scanner_devices FOR ALL
  USING (auth.uid() = user_id);

-- Event Reports: Users can create and view own reports
DROP POLICY IF EXISTS "Users can create reports" ON event_reports;
CREATE POLICY "Users can create reports"
  ON event_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own reports" ON event_reports;
CREATE POLICY "Users can view own reports"
  ON event_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Event Status History: Public read
DROP POLICY IF EXISTS "Event status history is publicly readable" ON event_status_history;
CREATE POLICY "Event status history is publicly readable"
  ON event_status_history FOR SELECT
  USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get remaining inventory for an event
CREATE OR REPLACE FUNCTION get_remaining_inventory(event_uuid UUID)
RETURNS TABLE (
  total_capacity INTEGER,
  sold_count INTEGER,
  reserved_count INTEGER,
  available_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.total_capacity,
    ti.sold_count,
    ti.reserved_count,
    ti.available_count
  FROM ticket_inventory ti
  WHERE ti.event_id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is organizer
CREATE OR REPLACE FUNCTION is_organizer(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organizers WHERE id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is event organizer
CREATE OR REPLACE FUNCTION is_event_organizer(user_uuid UUID, event_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM events 
    WHERE id = event_uuid AND organizer_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
