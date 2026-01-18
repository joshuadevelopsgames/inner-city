-- Reservation System for Atomic Inventory Management
-- Prevents overselling even under high concurrency

-- ============================================================================
-- RESERVATION TABLE
-- ============================================================================

CREATE TYPE reservation_status AS ENUM ('pending', 'consumed', 'expired', 'cancelled');

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status reservation_status DEFAULT 'pending' NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (status != 'consumed' OR consumed_at IS NOT NULL),
  CHECK (status != 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE INDEX idx_reservations_event ON reservations(event_id);
CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_expires ON reservations(expires_at) WHERE status = 'pending';
CREATE INDEX idx_reservations_stripe_session ON reservations(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX idx_reservations_event_status ON reservations(event_id, status);

-- ============================================================================
-- ATOMIC RESERVATION FUNCTIONS
-- ============================================================================

-- Function to create a reservation atomically
-- Returns reservation_id if successful, NULL if insufficient inventory
CREATE OR REPLACE FUNCTION create_reservation(
  p_event_id UUID,
  p_ticket_type_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_expires_in_minutes INTEGER DEFAULT 10
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_available INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Calculate expiration time
  v_expires_at := NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL;
  
  -- Lock inventory row for this event (prevents concurrent modifications)
  SELECT available_count INTO v_available
  FROM ticket_inventory
  WHERE event_id = p_event_id
  FOR UPDATE; -- Row-level lock
  
  -- Check if we have enough inventory
  IF v_available IS NULL THEN
    RAISE EXCEPTION 'Event inventory not found for event_id: %', p_event_id;
  END IF;
  
  IF v_available < p_quantity THEN
    -- Not enough inventory
    RETURN NULL;
  END IF;
  
  -- Create reservation
  INSERT INTO reservations (
    event_id,
    ticket_type_id,
    user_id,
    quantity,
    expires_at
  )
  VALUES (
    p_event_id,
    p_ticket_type_id,
    p_user_id,
    p_quantity,
    v_expires_at
  )
  RETURNING id INTO v_reservation_id;
  
  -- Update inventory: move from available to reserved
  UPDATE ticket_inventory
  SET reserved_count = reserved_count + p_quantity
  WHERE event_id = p_event_id;
  
  RETURN v_reservation_id;
END;
$$;

-- Function to consume a reservation (mark as used after payment)
-- Must be called within a transaction
CREATE OR REPLACE FUNCTION consume_reservation(
  p_reservation_id UUID,
  p_stripe_checkout_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
  v_ticket_type_id UUID;
BEGIN
  -- Lock reservation row
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  
  -- Check if reservation exists and is valid
  IF v_reservation IS NULL THEN
    RAISE EXCEPTION 'Reservation not found: %', p_reservation_id;
  END IF;
  
  IF v_reservation.status != 'pending' THEN
    RAISE EXCEPTION 'Reservation already consumed or expired: %', v_reservation.status;
  END IF;
  
  IF v_reservation.expires_at < NOW() THEN
    -- Expired - release inventory
    UPDATE ticket_inventory
    SET reserved_count = reserved_count - v_reservation.quantity
    WHERE event_id = v_reservation.event_id;
    
    UPDATE reservations
    SET status = 'expired',
        cancelled_at = NOW()
    WHERE id = p_reservation_id;
    
    RETURN FALSE;
  END IF;
  
  -- Mark reservation as consumed
  UPDATE reservations
  SET status = 'consumed',
      consumed_at = NOW(),
      stripe_checkout_session_id = p_stripe_checkout_session_id
  WHERE id = p_reservation_id;
  
  -- Move from reserved to sold in inventory
  UPDATE ticket_inventory
  SET reserved_count = reserved_count - v_reservation.quantity,
      sold_count = sold_count + v_reservation.quantity
  WHERE event_id = v_reservation.event_id;
  
  RETURN TRUE;
END;
$$;

-- Function to release a reservation (expired or cancelled)
CREATE OR REPLACE FUNCTION release_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
BEGIN
  -- Lock reservation row
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  
  IF v_reservation IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Only release if still pending
  IF v_reservation.status != 'pending' THEN
    RETURN FALSE;
  END IF;
  
  -- Release inventory
  UPDATE ticket_inventory
  SET reserved_count = reserved_count - v_reservation.quantity
  WHERE event_id = v_reservation.event_id;
  
  -- Mark as expired or cancelled
  IF v_reservation.expires_at < NOW() THEN
    UPDATE reservations
    SET status = 'expired',
        cancelled_at = NOW()
    WHERE id = p_reservation_id;
  ELSE
    UPDATE reservations
    SET status = 'cancelled',
        cancelled_at = NOW()
    WHERE id = p_reservation_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to clean up expired reservations (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_released_count INTEGER := 0;
  v_reservation reservations%ROWTYPE;
BEGIN
  -- Process expired reservations
  FOR v_reservation IN
    SELECT * FROM reservations
    WHERE status = 'pending'
      AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED -- Skip rows locked by other transactions
  LOOP
    -- Release inventory
    UPDATE ticket_inventory
    SET reserved_count = reserved_count - v_reservation.quantity
    WHERE event_id = v_reservation.event_id;
    
    -- Mark as expired
    UPDATE reservations
    SET status = 'expired',
        cancelled_at = NOW()
    WHERE id = v_reservation.id;
    
    v_released_count := v_released_count + 1;
  END LOOP;
  
  RETURN v_released_count;
END;
$$;

-- Function to get reservation details
CREATE OR REPLACE FUNCTION get_reservation(p_reservation_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  ticket_type_id UUID,
  user_id UUID,
  quantity INTEGER,
  status reservation_status,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.event_id,
    r.ticket_type_id,
    r.user_id,
    r.quantity,
    r.status,
    r.expires_at,
    r.created_at,
    (r.expires_at < NOW()) AS is_expired
  FROM reservations r
  WHERE r.id = p_reservation_id;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-expire reservations (optional - can also use cron job)
-- This trigger runs on SELECT but is better handled by a scheduled job
-- CREATE TRIGGER check_reservation_expiry BEFORE SELECT ON reservations
-- FOR EACH ROW EXECUTE FUNCTION expire_reservation_if_needed();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Users can view own reservations
CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Organizers can view reservations for their events
CREATE POLICY "Organizers can view event reservations"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = reservations.event_id
      AND events.organizer_id = auth.uid()
    )
  );

-- Service role can do everything (for Edge Functions)
-- Note: Edge Functions use service role, so they bypass RLS

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Composite index for common query pattern
CREATE INDEX idx_reservations_event_status_expires 
ON reservations(event_id, status, expires_at) 
WHERE status = 'pending';

-- Index for cleanup job
CREATE INDEX idx_reservations_expired_pending 
ON reservations(expires_at) 
WHERE status = 'pending' AND expires_at < NOW();
