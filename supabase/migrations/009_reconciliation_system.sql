-- Reconciliation System
-- Detects mismatches between tickets issued and payments captured

-- ============================================================================
-- RECONCILIATION RESULTS TABLE
-- ============================================================================

CREATE TABLE reconciliation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  
  -- Ticket counts
  tickets_issued_count INTEGER DEFAULT 0 NOT NULL,
  tickets_active_count INTEGER DEFAULT 0 NOT NULL,
  tickets_used_count INTEGER DEFAULT 0 NOT NULL,
  tickets_refunded_count INTEGER DEFAULT 0 NOT NULL,
  
  -- Payment counts
  payments_succeeded_count INTEGER DEFAULT 0 NOT NULL,
  payments_failed_count INTEGER DEFAULT 0 NOT NULL,
  payments_refunded_count INTEGER DEFAULT 0 NOT NULL,
  
  -- Amounts
  expected_revenue_cents BIGINT DEFAULT 0 NOT NULL,
  actual_revenue_cents BIGINT DEFAULT 0 NOT NULL,
  revenue_discrepancy_cents BIGINT GENERATED ALWAYS AS (expected_revenue_cents - actual_revenue_cents) STORED,
  
  -- Stripe reconciliation
  stripe_payment_intents_count INTEGER DEFAULT 0 NOT NULL,
  stripe_payment_intents_succeeded_count INTEGER DEFAULT 0 NOT NULL,
  
  -- Issues detected
  issues JSONB DEFAULT '[]'::jsonb, -- Array of issue objects
  has_discrepancies BOOLEAN GENERATED ALWAYS AS (
    revenue_discrepancy_cents != 0 OR
    tickets_issued_count != payments_succeeded_count OR
    jsonb_array_length(issues) > 0
  ) STORED,
  
  -- Status
  status TEXT CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  error_message TEXT,
  
  -- Metadata
  run_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_event ON reconciliation_results(event_id);
CREATE INDEX idx_reconciliation_organizer ON reconciliation_results(organizer_id);
CREATE INDEX idx_reconciliation_discrepancies ON reconciliation_results(has_discrepancies) WHERE has_discrepancies = TRUE;
CREATE INDEX idx_reconciliation_run_at ON reconciliation_results(run_at);

-- ============================================================================
-- RECONCILIATION FUNCTIONS
-- ============================================================================

-- Run reconciliation for an event
CREATE OR REPLACE FUNCTION reconcile_event(p_event_id UUID)
RETURNS reconciliation_results
LANGUAGE plpgsql
AS $$
DECLARE
  v_result reconciliation_results;
  v_organizer_id UUID;
  v_tickets_issued INTEGER;
  v_tickets_active INTEGER;
  v_tickets_used INTEGER;
  v_tickets_refunded INTEGER;
  v_payments_succeeded INTEGER;
  v_payments_failed INTEGER;
  v_payments_refunded INTEGER;
  v_expected_revenue BIGINT;
  v_actual_revenue BIGINT;
  v_stripe_pi_count INTEGER;
  v_stripe_pi_succeeded INTEGER;
  v_issues JSONB := '[]'::jsonb;
  v_issue JSONB;
BEGIN
  -- Get organizer
  SELECT organizer_id INTO v_organizer_id
  FROM events
  WHERE id = p_event_id;
  
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
  
  -- Count tickets
  SELECT
    COUNT(*) FILTER (WHERE status IN ('active', 'used', 'refunded', 'transferred', 'revoked')),
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'used'),
    COUNT(*) FILTER (WHERE status = 'refunded')
  INTO
    v_tickets_issued,
    v_tickets_active,
    v_tickets_used,
    v_tickets_refunded
  FROM tickets
  WHERE event_id = p_event_id;
  
  -- Count payments
  SELECT
    COUNT(*) FILTER (WHERE status = 'succeeded'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'refunded')
  INTO
    v_payments_succeeded,
    v_payments_failed,
    v_payments_refunded
  FROM payments
  WHERE event_id = p_event_id;
  
  -- Calculate expected revenue (tickets issued * average price)
  SELECT COALESCE(SUM(purchase_price_cents), 0) INTO v_expected_revenue
  FROM tickets
  WHERE event_id = p_event_id
    AND status != 'refunded';
  
  -- Calculate actual revenue (succeeded payments)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_actual_revenue
  FROM payments
  WHERE event_id = p_event_id
    AND status = 'succeeded';
  
  -- Count Stripe payment intents
  SELECT
    COUNT(DISTINCT stripe_payment_intent_id),
    COUNT(DISTINCT stripe_payment_intent_id) FILTER (WHERE status = 'succeeded')
  INTO
    v_stripe_pi_count,
    v_stripe_pi_succeeded
  FROM payments
  WHERE event_id = p_event_id;
  
  -- Detect issues
  
  -- Issue 1: Ticket count mismatch
  IF v_tickets_issued != v_payments_succeeded THEN
    v_issue := jsonb_build_object(
      'type', 'ticket_payment_mismatch',
      'severity', 'high',
      'message', format('Tickets issued (%s) does not match payments succeeded (%s)', v_tickets_issued, v_payments_succeeded),
      'tickets_issued', v_tickets_issued,
      'payments_succeeded', v_payments_succeeded
    );
    v_issues := v_issues || v_issue;
  END IF;
  
  -- Issue 2: Revenue discrepancy
  IF ABS(v_expected_revenue - v_actual_revenue) > 100 THEN -- Allow $1 tolerance
    v_issue := jsonb_build_object(
      'type', 'revenue_discrepancy',
      'severity', 'high',
      'message', format('Expected revenue (%s) does not match actual revenue (%s)', v_expected_revenue, v_actual_revenue),
      'expected_cents', v_expected_revenue,
      'actual_cents', v_actual_revenue,
      'discrepancy_cents', v_expected_revenue - v_actual_revenue
    );
    v_issues := v_issues || v_issue;
  END IF;
  
  -- Issue 3: Tickets without payments
  IF EXISTS (
    SELECT 1
    FROM tickets t
    WHERE t.event_id = p_event_id
      AND t.status != 'refunded'
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.ticket_id = t.id
          AND p.status = 'succeeded'
      )
  ) THEN
    v_issue := jsonb_build_object(
      'type', 'tickets_without_payments',
      'severity', 'medium',
      'message', 'Some tickets exist without corresponding succeeded payments'
    );
    v_issues := v_issues || v_issue;
  END IF;
  
  -- Issue 4: Payments without tickets
  IF EXISTS (
    SELECT 1
    FROM payments p
    WHERE p.event_id = p_event_id
      AND p.status = 'succeeded'
      AND p.ticket_id IS NULL
  ) THEN
    v_issue := jsonb_build_object(
      'type', 'payments_without_tickets',
      'severity', 'high',
      'message', 'Some payments succeeded but no tickets were issued'
    );
    v_issues := v_issues || v_issue;
  END IF;
  
  -- Issue 5: Duplicate payment intents
  IF EXISTS (
    SELECT stripe_payment_intent_id, COUNT(*)
    FROM payments
    WHERE event_id = p_event_id
    GROUP BY stripe_payment_intent_id
    HAVING COUNT(*) > 1
  ) THEN
    v_issue := jsonb_build_object(
      'type', 'duplicate_payment_intents',
      'severity', 'medium',
      'message', 'Some payment intents are associated with multiple payments'
    );
    v_issues := v_issues || v_issue;
  END IF;
  
  -- Create reconciliation result
  INSERT INTO reconciliation_results (
    event_id,
    organizer_id,
    tickets_issued_count,
    tickets_active_count,
    tickets_used_count,
    tickets_refunded_count,
    payments_succeeded_count,
    payments_failed_count,
    payments_refunded_count,
    expected_revenue_cents,
    actual_revenue_cents,
    stripe_payment_intents_count,
    stripe_payment_intents_succeeded_count,
    issues,
    status,
    run_at
  ) VALUES (
    p_event_id,
    v_organizer_id,
    v_tickets_issued,
    v_tickets_active,
    v_tickets_used,
    v_tickets_refunded,
    v_payments_succeeded,
    v_payments_failed,
    v_payments_refunded,
    v_expected_revenue,
    v_actual_revenue,
    v_stripe_pi_count,
    v_stripe_pi_succeeded,
    v_issues,
    'completed',
    NOW()
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Get events needing reconciliation
CREATE OR REPLACE FUNCTION get_events_needing_reconciliation(
  p_hours_ago INTEGER DEFAULT 24
)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  organizer_id UUID,
  last_reconciliation TIMESTAMPTZ,
  has_discrepancies BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.organizer_id,
    MAX(r.run_at) AS last_reconciliation,
    BOOL_OR(r.has_discrepancies) AS has_discrepancies
  FROM events e
  LEFT JOIN reconciliation_results r ON r.event_id = e.id
  WHERE e.status IN ('active', 'completed')
    AND e.end_at < NOW() - (p_hours_ago || ' hours')::INTERVAL
  GROUP BY e.id, e.title, e.organizer_id
  HAVING MAX(r.run_at) IS NULL
     OR MAX(r.run_at) < NOW() - (p_hours_ago || ' hours')::INTERVAL
     OR BOOL_OR(r.has_discrepancies) = TRUE
  ORDER BY e.end_at DESC;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;

-- Organizers can view own reconciliation results
CREATE POLICY "Organizers can view own reconciliation results"
  ON reconciliation_results FOR SELECT
  USING (organizer_id = auth.uid());
