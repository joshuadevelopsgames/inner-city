-- Atomic Check-In Function
-- Ensures ticket can only be checked in once, even under concurrency

CREATE OR REPLACE FUNCTION check_in_ticket_atomic(
  p_ticket_id UUID,
  p_event_id UUID,
  p_scanner_user_id UUID,
  p_scanner_device_id TEXT,
  p_qr_secret TEXT,
  p_qr_nonce INTEGER,
  p_location_lat DECIMAL DEFAULT NULL,
  p_location_lng DECIMAL DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
BEGIN
  -- Lock ticket row (prevents concurrent check-ins)
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = p_ticket_id
  FOR UPDATE; -- Row-level lock
  
  -- Verify ticket exists
  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;
  
  -- Verify ticket belongs to event
  IF v_ticket.event_id != p_event_id THEN
    RAISE EXCEPTION 'Ticket does not belong to event. Ticket event: %, Expected: %', v_ticket.event_id, p_event_id;
  END IF;
  
  -- Check ticket status
  IF v_ticket.status != 'active' THEN
    RAISE EXCEPTION 'Ticket cannot be checked in. Status: %', v_ticket.status;
  END IF;
  
  -- Check if already checked in (double-check)
  IF EXISTS (
    SELECT 1 FROM check_in_logs
    WHERE ticket_id = p_ticket_id
      AND result = 'valid'
  ) THEN
    RAISE EXCEPTION 'Ticket already checked in';
  END IF;
  
  -- Atomically update ticket status
  UPDATE tickets
  SET status = 'used',
      checked_in_at = NOW(),
      checked_in_by = p_scanner_user_id,
      updated_at = NOW()
  WHERE id = p_ticket_id
    AND status = 'active'; -- Only update if still active
  
  -- Verify update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update ticket status (may have been checked in concurrently)';
  END IF;
  
  -- Insert immutable check-in log
  INSERT INTO check_in_logs (
    ticket_id,
    event_id,
    scanner_user_id,
    scanner_device_id,
    qr_secret,
    qr_nonce,
    result,
    reason,
    location_lat,
    location_lng
  )
  VALUES (
    p_ticket_id,
    p_event_id,
    p_scanner_user_id,
    p_scanner_device_id,
    p_qr_secret,
    p_qr_nonce,
    'valid',
    'Ticket checked in successfully',
    p_location_lat,
    p_location_lng
  );
  
  -- Update inventory (decrement sold_count if needed - though this should already be done)
  -- Actually, sold_count is updated when ticket is created, so no change needed here
END;
$$;
