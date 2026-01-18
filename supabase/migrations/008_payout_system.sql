-- Payout Safety System (Escrow-like)
-- Implements fund holding, trust tiers, and payout scheduling

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE payout_status AS ENUM ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE trust_tier AS ENUM ('new', 'verified', 'trusted', 'premium');
CREATE TYPE ledger_entry_type AS ENUM ('sale', 'refund', 'fee', 'payout', 'adjustment');

-- ============================================================================
-- TRUST TIER SYSTEM
-- ============================================================================

-- Add trust tier to organizers
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS trust_tier trust_tier DEFAULT 'new' NOT NULL,
ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0 CHECK (trust_score >= 0),
ADD COLUMN IF NOT EXISTS events_completed INTEGER DEFAULT 0 CHECK (events_completed >= 0),
ADD COLUMN IF NOT EXISTS total_revenue_cents BIGINT DEFAULT 0 CHECK (total_revenue_cents >= 0),
ADD COLUMN IF NOT EXISTS chargeback_count INTEGER DEFAULT 0 CHECK (chargeback_count >= 0),
ADD COLUMN IF NOT EXISTS payout_delay_hours INTEGER DEFAULT 24 CHECK (payout_delay_hours >= 0);

-- Index for trust tier queries
CREATE INDEX IF NOT EXISTS idx_organizers_trust_tier ON organizers(trust_tier);
CREATE INDEX IF NOT EXISTS idx_organizers_trust_score ON organizers(trust_score);

-- ============================================================================
-- LEDGER TABLE
-- ============================================================================

-- Financial ledger for events (aggregated view)
CREATE TABLE event_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  
  -- Gross sales
  gross_sales_cents BIGINT DEFAULT 0 NOT NULL CHECK (gross_sales_cents >= 0),
  
  -- Fees
  platform_fees_cents BIGINT DEFAULT 0 NOT NULL CHECK (platform_fees_cents >= 0),
  stripe_fees_cents BIGINT DEFAULT 0 NOT NULL CHECK (stripe_fees_cents >= 0),
  total_fees_cents BIGINT GENERATED ALWAYS AS (platform_fees_cents + stripe_fees_cents) STORED,
  
  -- Net amounts
  net_owed_cents BIGINT GENERATED ALWAYS AS (gross_sales_cents - platform_fees_cents - stripe_fees_cents) STORED,
  
  -- Payouts
  payouts_sent_cents BIGINT DEFAULT 0 NOT NULL CHECK (payouts_sent_cents >= 0),
  
  -- Refunds
  refunds_issued_cents BIGINT DEFAULT 0 NOT NULL CHECK (refunds_issued_cents >= 0),
  refund_reserve_cents BIGINT DEFAULT 0 NOT NULL CHECK (refund_reserve_cents >= 0),
  
  -- Available for payout
  available_for_payout_cents BIGINT GENERATED ALWAYS AS (
    net_owed_cents - payouts_sent_cents - refund_reserve_cents
  ) STORED,
  
  -- Metadata
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(event_id)
);

CREATE INDEX idx_ledger_event ON event_ledger(event_id);
CREATE INDEX idx_ledger_organizer ON event_ledger(organizer_id);
CREATE INDEX idx_ledger_available ON event_ledger(available_for_payout_cents) WHERE available_for_payout_cents > 0;

-- ============================================================================
-- LEDGER ENTRIES (Audit Trail)
-- ============================================================================

-- Detailed ledger entries for audit trail
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  entry_type ledger_entry_type NOT NULL,
  
  -- Amounts
  amount_cents BIGINT NOT NULL, -- Can be negative for refunds
  fee_cents BIGINT DEFAULT 0,
  
  -- References
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  
  -- Description
  description TEXT NOT NULL,
  metadata JSONB, -- Additional context
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_ledger_entries_event ON ledger_entries(event_id);
CREATE INDEX idx_ledger_entries_organizer ON ledger_entries(organizer_id);
CREATE INDEX idx_ledger_entries_type ON ledger_entries(entry_type);
CREATE INDEX idx_ledger_entries_created ON ledger_entries(created_at);
CREATE INDEX idx_ledger_entries_payment ON ledger_entries(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_ledger_entries_payout ON ledger_entries(payout_id) WHERE payout_id IS NOT NULL;

-- ============================================================================
-- PAYOUTS TABLE
-- ============================================================================

-- Payout records
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- NULL for aggregated payouts
  
  -- Amounts
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT DEFAULT 'usd' NOT NULL,
  
  -- Stripe
  stripe_payout_id TEXT UNIQUE, -- Stripe Transfer/Payout ID
  stripe_connect_account_id TEXT NOT NULL,
  
  -- Status
  status payout_status DEFAULT 'pending' NOT NULL,
  
  -- Timing
  scheduled_for TIMESTAMPTZ NOT NULL, -- When payout should execute
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  description TEXT,
  failure_reason TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_organizer ON payouts(organizer_id);
CREATE INDEX idx_payouts_event ON payouts(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_scheduled ON payouts(scheduled_for) WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_payouts_stripe ON payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;

-- ============================================================================
-- PAYOUT SCHEDULES
-- ============================================================================

-- Payout schedule rules per organizer/event
CREATE TABLE payout_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE, -- NULL for organizer-level defaults
  
  -- Timing rules
  hold_until_event_end BOOLEAN DEFAULT TRUE,
  hold_delay_hours INTEGER DEFAULT 24 CHECK (hold_delay_hours >= 0),
  min_payout_amount_cents BIGINT DEFAULT 10000 CHECK (min_payout_amount_cents >= 0), -- $100 minimum
  
  -- Trust tier overrides
  trust_tier trust_tier, -- NULL means use organizer's current tier
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organizer_id, event_id)
);

CREATE INDEX idx_payout_schedules_organizer ON payout_schedules(organizer_id);
CREATE INDEX idx_payout_schedules_event ON payout_schedules(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_payout_schedules_active ON payout_schedules(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate event ledger from payments
CREATE OR REPLACE FUNCTION calculate_event_ledger(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_gross_sales BIGINT;
  v_platform_fees BIGINT;
  v_stripe_fees BIGINT;
  v_refunds BIGINT;
  v_payouts_sent BIGINT;
  v_event_end TIMESTAMPTZ;
  v_hold_delay_hours INTEGER;
  v_refund_reserve BIGINT;
BEGIN
  -- Get event end time
  SELECT end_at INTO v_event_end
  FROM events
  WHERE id = p_event_id;
  
  -- Calculate gross sales (succeeded payments only)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_gross_sales
  FROM payments
  WHERE event_id = p_event_id
    AND status = 'succeeded';
  
  -- Calculate platform fees
  SELECT COALESCE(SUM(platform_fee_cents), 0) INTO v_platform_fees
  FROM payments
  WHERE event_id = p_event_id
    AND status = 'succeeded';
  
  -- Calculate Stripe fees (estimated at 2.9% + $0.30 per transaction)
  -- In production, fetch actual fees from Stripe API
  SELECT COALESCE(SUM(
    ROUND(amount_cents * 0.029) + 30 -- 2.9% + $0.30
  ), 0) INTO v_stripe_fees
  FROM payments
  WHERE event_id = p_event_id
    AND status = 'succeeded';
  
  -- Calculate refunds
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_refunds
  FROM payments
  WHERE event_id = p_event_id
    AND status = 'refunded';
  
  -- Calculate payouts sent
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_payouts_sent
  FROM payouts
  WHERE event_id = p_event_id
    AND status = 'completed';
  
  -- Calculate refund reserve (hold 10% of gross sales for 30 days after event)
  IF v_event_end > NOW() - INTERVAL '30 days' THEN
    v_refund_reserve := ROUND(v_gross_sales * 0.10);
  ELSE
    v_refund_reserve := 0;
  END IF;
  
  -- Upsert ledger
  INSERT INTO event_ledger (
    event_id,
    organizer_id,
    gross_sales_cents,
    platform_fees_cents,
    stripe_fees_cents,
    refunds_issued_cents,
    payouts_sent_cents,
    refund_reserve_cents,
    last_calculated_at,
    updated_at
  )
  SELECT
    p_event_id,
    organizer_id,
    v_gross_sales,
    v_platform_fees,
    v_stripe_fees,
    v_refunds,
    v_payouts_sent,
    v_refund_reserve,
    NOW(),
    NOW()
  FROM events
  WHERE id = p_event_id
  ON CONFLICT (event_id) DO UPDATE SET
    gross_sales_cents = EXCLUDED.gross_sales_cents,
    platform_fees_cents = EXCLUDED.platform_fees_cents,
    stripe_fees_cents = EXCLUDED.stripe_fees_cents,
    refunds_issued_cents = EXCLUDED.refunds_issued_cents,
    payouts_sent_cents = EXCLUDED.payouts_sent_cents,
    refund_reserve_cents = EXCLUDED.refund_reserve_cents,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Get payout schedule for event
CREATE OR REPLACE FUNCTION get_payout_schedule(
  p_organizer_id UUID,
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  hold_until_event_end BOOLEAN,
  hold_delay_hours INTEGER,
  min_payout_amount_cents BIGINT,
  trust_tier trust_tier
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_schedule payout_schedules%ROWTYPE;
  v_organizer_tier trust_tier;
BEGIN
  -- Try event-specific schedule first
  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_schedule
    FROM payout_schedules
    WHERE organizer_id = p_organizer_id
      AND event_id = p_event_id
      AND is_active = TRUE;
  END IF;
  
  -- Fall back to organizer-level default
  IF v_schedule IS NULL THEN
    SELECT * INTO v_schedule
    FROM payout_schedules
    WHERE organizer_id = p_organizer_id
      AND event_id IS NULL
      AND is_active = TRUE;
  END IF;
  
  -- Get organizer's trust tier
  SELECT trust_tier INTO v_organizer_tier
  FROM organizers
  WHERE id = p_organizer_id;
  
  -- Return schedule with defaults
  RETURN QUERY SELECT
    COALESCE(v_schedule.hold_until_event_end, TRUE),
    COALESCE(v_schedule.hold_delay_hours, 
      CASE v_organizer_tier
        WHEN 'trusted' THEN 0
        WHEN 'verified' THEN 12
        WHEN 'new' THEN 48
        ELSE 24
      END
    ),
    COALESCE(v_schedule.min_payout_amount_cents, 10000),
    COALESCE(v_schedule.trust_tier, v_organizer_tier);
END;
$$;

-- Calculate when payout can be scheduled
CREATE OR REPLACE FUNCTION calculate_payout_available_at(
  p_event_id UUID,
  p_organizer_id UUID
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_end TIMESTAMPTZ;
  v_schedule RECORD;
  v_available_at TIMESTAMPTZ;
BEGIN
  -- Get event end time
  SELECT end_at INTO v_event_end
  FROM events
  WHERE id = p_event_id;
  
  -- Get payout schedule
  SELECT * INTO v_schedule
  FROM get_payout_schedule(p_organizer_id, p_event_id);
  
  -- Calculate available time
  IF v_schedule.hold_until_event_end THEN
    v_available_at := v_event_end + (v_schedule.hold_delay_hours || ' hours')::INTERVAL;
  ELSE
    v_available_at := NOW() + (v_schedule.hold_delay_hours || ' hours')::INTERVAL;
  END IF;
  
  RETURN v_available_at;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update ledger when payment status changes
CREATE OR REPLACE FUNCTION update_ledger_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate ledger when payment status changes
  IF OLD.status != NEW.status OR OLD.amount_cents != NEW.amount_cents THEN
    PERFORM calculate_event_ledger(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_ledger_on_payment
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_ledger_on_payment_change();

-- Auto-update ledger when payout completes
CREATE OR REPLACE FUNCTION update_ledger_on_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF NEW.event_id IS NOT NULL THEN
      PERFORM calculate_event_ledger(NEW.event_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_ledger_on_payout
  AFTER UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_ledger_on_payout();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_schedules ENABLE ROW LEVEL SECURITY;

-- Organizers can view own ledger
CREATE POLICY "Organizers can view own ledger"
  ON event_ledger FOR SELECT
  USING (organizer_id = auth.uid());

-- Organizers can view own ledger entries
CREATE POLICY "Organizers can view own ledger entries"
  ON ledger_entries FOR SELECT
  USING (organizer_id = auth.uid());

-- Organizers can view own payouts
CREATE POLICY "Organizers can view own payouts"
  ON payouts FOR SELECT
  USING (organizer_id = auth.uid());

-- Organizers can view own payout schedules
CREATE POLICY "Organizers can view own payout schedules"
  ON payout_schedules FOR SELECT
  USING (organizer_id = auth.uid());

-- Only service role can insert/update ledger and payouts
-- (Edge Functions will handle this)
