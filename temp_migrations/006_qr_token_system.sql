-- QR Token System for Ticket Validation
-- Supports both Mode A (signed) and Mode B (rotating)

-- ============================================================================
-- USED NONCES TABLE (Mode A)
-- ============================================================================

CREATE TABLE used_nonces (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  scanner_user_id UUID REFERENCES auth.users(id),
  PRIMARY KEY (ticket_id, nonce)
);

CREATE INDEX idx_used_nonces_ticket ON used_nonces(ticket_id);
CREATE INDEX idx_used_nonces_used_at ON used_nonces(used_at);
CREATE INDEX idx_used_nonces_cleanup ON used_nonces(used_at) WHERE used_at < NOW() - INTERVAL '24 hours';

-- ============================================================================
-- QR TOKEN GENERATION FUNCTIONS
-- ============================================================================

-- Mode A: Generate signed token with nonce
CREATE OR REPLACE FUNCTION generate_qr_token_mode_a(
  p_ticket_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
  v_nonce TEXT;
  v_issued_at BIGINT;
  v_payload TEXT;
  v_signature TEXT;
  v_token JSONB;
BEGIN
  -- Get ticket with qr_secret
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = p_ticket_id
    AND buyer_id = auth.uid(); -- Users can only generate tokens for own tickets
  
  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found or unauthorized';
  END IF;
  
  IF v_ticket.status != 'active' THEN
    RAISE EXCEPTION 'Ticket is not active (status: %)', v_ticket.status;
  END IF;
  
  -- Generate nonce (32 bytes = 64 hex chars)
  v_nonce := encode(gen_random_bytes(32), 'hex');
  v_issued_at := EXTRACT(EPOCH FROM NOW())::BIGINT;
  
  -- Create payload: ticket_id|issued_at|nonce
  v_payload := v_ticket.id::TEXT || '|' || v_issued_at::TEXT || '|' || v_nonce;
  
  -- Generate HMAC signature (using pgcrypto)
  v_signature := encode(
    HMAC(
      v_payload,
      v_ticket.qr_secret,
      'sha256'
    ),
    'hex'
  );
  
  -- Build token
  v_token := jsonb_build_object(
    't', v_ticket.id::TEXT,
    'i', v_issued_at,
    'n', v_nonce,
    's', v_signature,
    'mode', 'A'
  );
  
  RETURN v_token;
END;
$$;

-- Mode B: Generate rotating token
CREATE OR REPLACE FUNCTION generate_qr_token_mode_b(
  p_ticket_id UUID,
  p_rotation_interval INTEGER DEFAULT 60 -- seconds
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
  v_time_window BIGINT;
  v_rotation_nonce INTEGER;
  v_payload TEXT;
  v_signature TEXT;
  v_token JSONB;
BEGIN
  -- Get ticket with qr_secret
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = p_ticket_id
    AND buyer_id = auth.uid();
  
  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found or unauthorized';
  END IF;
  
  IF v_ticket.status != 'active' THEN
    RAISE EXCEPTION 'Ticket is not active (status: %)', v_ticket.status;
  END IF;
  
  -- Calculate time window (round down to rotation interval)
  v_time_window := (EXTRACT(EPOCH FROM NOW())::BIGINT / p_rotation_interval) * p_rotation_interval;
  
  -- Use current rotation nonce
  v_rotation_nonce := v_ticket.qr_rotation_nonce;
  
  -- Create payload: ticket_id|time_window|rotation_nonce
  v_payload := v_ticket.id::TEXT || '|' || v_time_window::TEXT || '|' || v_rotation_nonce::TEXT;
  
  -- Generate HMAC signature
  v_signature := encode(
    HMAC(
      v_payload,
      v_ticket.qr_secret,
      'sha256'
    ),
    'hex'
  );
  
  -- Build token
  v_token := jsonb_build_object(
    't', v_ticket.id::TEXT,
    'w', v_time_window,
    'r', v_rotation_nonce,
    's', v_signature,
    'mode', 'B',
    'expires_at', (v_time_window + p_rotation_interval)::BIGINT
  );
  
  RETURN v_token;
END;
$$;

-- ============================================================================
-- TOKEN VALIDATION FUNCTIONS
-- ============================================================================

-- Mode A: Validate signed token
CREATE OR REPLACE FUNCTION validate_qr_token_mode_a(
  p_token JSONB
)
RETURNS TABLE (
  valid BOOLEAN,
  ticket_id UUID,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id UUID;
  v_issued_at BIGINT;
  v_nonce TEXT;
  v_signature TEXT;
  v_ticket tickets%ROWTYPE;
  v_payload TEXT;
  v_expected_signature TEXT;
  v_nonce_exists BOOLEAN;
  v_token_age INTERVAL;
BEGIN
  -- Extract token fields
  v_ticket_id := (p_token->>'t')::UUID;
  v_issued_at := (p_token->>'i')::BIGINT;
  v_nonce := p_token->>'n';
  v_signature := p_token->>'s';
  
  -- Validate required fields
  IF v_ticket_id IS NULL OR v_issued_at IS NULL OR v_nonce IS NULL OR v_signature IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid token format'::TEXT;
    RETURN;
  END IF;
  
  -- Get ticket
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = v_ticket_id
  FOR UPDATE; -- Lock ticket row
  
  IF v_ticket IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Ticket not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check ticket status
  IF v_ticket.status != 'active' THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, format('Ticket status is %s', v_ticket.status)::TEXT;
    RETURN;
  END IF;
  
  -- Check expiration (24 hours)
  v_token_age := NOW() - to_timestamp(v_issued_at);
  IF v_token_age > INTERVAL '24 hours' THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, 'Token expired'::TEXT;
    RETURN;
  END IF;
  
  -- Verify signature
  v_payload := v_ticket.id::TEXT || '|' || v_issued_at::TEXT || '|' || v_nonce;
  v_expected_signature := encode(
    HMAC(v_payload, v_ticket.qr_secret, 'sha256'),
    'hex'
  );
  
  IF v_signature != v_expected_signature THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, 'Invalid signature'::TEXT;
    RETURN;
  END IF;
  
  -- Check if nonce already used (replay attack)
  SELECT EXISTS(
    SELECT 1 FROM used_nonces
    WHERE ticket_id = v_ticket_id AND nonce = v_nonce
  ) INTO v_nonce_exists;
  
  IF v_nonce_exists THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, 'Token already used (replay attack)'::TEXT;
    RETURN;
  END IF;
  
  -- Mark nonce as used
  INSERT INTO used_nonces (ticket_id, nonce, scanner_user_id)
  VALUES (v_ticket_id, v_nonce, auth.uid())
  ON CONFLICT DO NOTHING;
  
  RETURN QUERY SELECT TRUE, v_ticket_id, 'Valid token'::TEXT;
END;
$$;

-- Mode B: Validate rotating token
CREATE OR REPLACE FUNCTION validate_qr_token_mode_b(
  p_token JSONB,
  p_rotation_interval INTEGER DEFAULT 60,
  p_clock_skew_tolerance INTEGER DEFAULT 5 -- seconds
)
RETURNS TABLE (
  valid BOOLEAN,
  ticket_id UUID,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id UUID;
  v_time_window BIGINT;
  v_rotation_nonce INTEGER;
  v_signature TEXT;
  v_ticket tickets%ROWTYPE;
  v_payload TEXT;
  v_expected_signature TEXT;
  v_current_time_window BIGINT;
  v_window_diff INTEGER;
BEGIN
  -- Extract token fields
  v_ticket_id := (p_token->>'t')::UUID;
  v_time_window := (p_token->>'w')::BIGINT;
  v_rotation_nonce := (p_token->>'r')::INTEGER;
  v_signature := p_token->>'s';
  
  -- Validate required fields
  IF v_ticket_id IS NULL OR v_time_window IS NULL OR v_rotation_nonce IS NULL OR v_signature IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid token format'::TEXT;
    RETURN;
  END IF;
  
  -- Get ticket
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = v_ticket_id
  FOR UPDATE;
  
  IF v_ticket IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Ticket not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check ticket status
  IF v_ticket.status != 'active' THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, format('Ticket status is %s', v_ticket.status)::TEXT;
    RETURN;
  END IF;
  
  -- Calculate current time window
  v_current_time_window := (EXTRACT(EPOCH FROM NOW())::BIGINT / p_rotation_interval) * p_rotation_interval;
  
  -- Check time window freshness (allow 1 window tolerance + clock skew)
  v_window_diff := ABS(v_current_time_window - v_time_window);
  IF v_window_diff > (p_rotation_interval + p_clock_skew_tolerance) THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, format('Token time window expired (diff: %s seconds)', v_window_diff)::TEXT;
    RETURN;
  END IF;
  
  -- Check rotation nonce (allow small tolerance for concurrent scans)
  IF ABS(v_ticket.qr_rotation_nonce - v_rotation_nonce) > 1 THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, format('Rotation nonce mismatch (expected: %s, got: %s)', v_ticket.qr_rotation_nonce, v_rotation_nonce)::TEXT;
    RETURN;
  END IF;
  
  -- Verify signature
  v_payload := v_ticket.id::TEXT || '|' || v_time_window::TEXT || '|' || v_rotation_nonce::TEXT;
  v_expected_signature := encode(
    HMAC(v_payload, v_ticket.qr_secret, 'sha256'),
    'hex'
  );
  
  IF v_signature != v_expected_signature THEN
    RETURN QUERY SELECT FALSE, v_ticket_id, 'Invalid signature'::TEXT;
    RETURN;
  END IF;
  
  -- Increment rotation nonce (prevents reuse of same token)
  UPDATE tickets
  SET qr_rotation_nonce = qr_rotation_nonce + 1
  WHERE id = v_ticket_id;
  
  RETURN QUERY SELECT TRUE, v_ticket_id, 'Valid token'::TEXT;
END;
$$;

-- Universal validation function (detects mode automatically)
CREATE OR REPLACE FUNCTION validate_qr_token(
  p_token JSONB,
  p_rotation_interval INTEGER DEFAULT 60
)
RETURNS TABLE (
  valid BOOLEAN,
  ticket_id UUID,
  reason TEXT,
  mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mode TEXT;
  v_result RECORD;
BEGIN
  -- Detect mode
  IF p_token ? 'w' THEN
    v_mode := 'B'; -- Rotating mode
  ELSIF p_token ? 'i' THEN
    v_mode := 'A'; -- Signed mode
  ELSE
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Unknown token mode'::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Validate based on mode
  IF v_mode = 'A' THEN
    FOR v_result IN SELECT * FROM validate_qr_token_mode_a(p_token) LOOP
      RETURN QUERY SELECT v_result.valid, v_result.ticket_id, v_result.reason, 'A'::TEXT;
    END LOOP;
  ELSE
    FOR v_result IN SELECT * FROM validate_qr_token_mode_b(p_token, p_rotation_interval) LOOP
      RETURN QUERY SELECT v_result.valid, v_result.ticket_id, v_result.reason, 'B'::TEXT;
    END LOOP;
  END IF;
END;
$$;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Clean up old used nonces (Mode A)
CREATE OR REPLACE FUNCTION cleanup_used_nonces()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM used_nonces
  WHERE used_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE used_nonces ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (via validation function)
-- Users can view own ticket's nonces (for debugging)
CREATE POLICY "Users can view own ticket nonces"
  ON used_nonces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets
      WHERE tickets.id = used_nonces.ticket_id
      AND tickets.buyer_id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Already created above, but ensure they exist
CREATE INDEX IF NOT EXISTS idx_used_nonces_ticket ON used_nonces(ticket_id);
CREATE INDEX IF NOT EXISTS idx_used_nonces_used_at ON used_nonces(used_at);

-- Enable pgcrypto extension for HMAC
CREATE EXTENSION IF NOT EXISTS pgcrypto;
