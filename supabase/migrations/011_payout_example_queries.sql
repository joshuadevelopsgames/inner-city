-- Example Queries for Payout System

-- ============================================================================
-- LEDGER QUERIES
-- ============================================================================

-- Get ledger for an event
SELECT
  el.*,
  e.title AS event_title,
  o.display_name AS organizer_name,
  o.trust_tier
FROM event_ledger el
JOIN events e ON e.id = el.event_id
JOIN organizers o ON o.id = el.organizer_id
WHERE el.event_id = 'event-uuid-here';

-- Get all events with available payouts
SELECT
  el.event_id,
  e.title,
  e.end_at,
  o.display_name AS organizer_name,
  o.trust_tier,
  el.available_for_payout_cents,
  el.gross_sales_cents,
  el.payouts_sent_cents
FROM event_ledger el
JOIN events e ON e.id = el.event_id
JOIN organizers o ON o.id = el.organizer_id
WHERE el.available_for_payout_cents > 0
  AND e.status = 'completed'
ORDER BY e.end_at DESC;

-- Get organizer's total available payouts across all events
SELECT
  o.id AS organizer_id,
  o.display_name,
  o.trust_tier,
  SUM(el.available_for_payout_cents) AS total_available_cents,
  COUNT(el.event_id) AS events_with_funds
FROM organizers o
LEFT JOIN event_ledger el ON el.organizer_id = o.id
WHERE el.available_for_payout_cents > 0
GROUP BY o.id, o.display_name, o.trust_tier
ORDER BY total_available_cents DESC;

-- ============================================================================
-- PAYOUT QUERIES
-- ============================================================================

-- Get scheduled payouts ready to process
SELECT
  p.*,
  e.title AS event_title,
  o.display_name AS organizer_name,
  o.stripe_connect_account_id
FROM payouts p
JOIN organizers o ON o.id = p.organizer_id
LEFT JOIN events e ON e.id = p.event_id
WHERE p.status IN ('pending', 'scheduled')
  AND p.scheduled_for <= NOW()
ORDER BY p.scheduled_for ASC;

-- Get payout history for an organizer
SELECT
  p.*,
  e.title AS event_title,
  CASE
    WHEN p.status = 'completed' THEN 'Completed'
    WHEN p.status = 'failed' THEN 'Failed'
    WHEN p.status = 'processing' THEN 'Processing'
    WHEN p.scheduled_for > NOW() THEN 'Scheduled'
    ELSE 'Pending'
  END AS status_display
FROM payouts p
LEFT JOIN events e ON e.id = p.event_id
WHERE p.organizer_id = 'organizer-uuid-here'
ORDER BY p.created_at DESC;

-- Get failed payouts needing attention
SELECT
  p.*,
  e.title AS event_title,
  o.display_name AS organizer_name,
  o.stripe_connect_account_id
FROM payouts p
JOIN organizers o ON o.id = p.organizer_id
LEFT JOIN events e ON e.id = p.event_id
WHERE p.status = 'failed'
ORDER BY p.updated_at DESC;

-- ============================================================================
-- LEDGER ENTRIES (AUDIT TRAIL)
-- ============================================================================

-- Get all ledger entries for an event
SELECT
  le.*,
  p.stripe_payment_intent_id,
  po.stripe_payout_id
FROM ledger_entries le
LEFT JOIN payments p ON p.id = le.payment_id
LEFT JOIN payouts po ON po.id = le.payout_id
WHERE le.event_id = 'event-uuid-here'
ORDER BY le.created_at DESC;

-- Get financial summary for an event
SELECT
  entry_type,
  COUNT(*) AS transaction_count,
  SUM(amount_cents) AS total_amount_cents,
  SUM(fee_cents) AS total_fees_cents
FROM ledger_entries
WHERE event_id = 'event-uuid-here'
GROUP BY entry_type
ORDER BY entry_type;

-- ============================================================================
-- RECONCILIATION QUERIES
-- ============================================================================

-- Get latest reconciliation results
SELECT
  rr.*,
  e.title AS event_title,
  o.display_name AS organizer_name
FROM reconciliation_results rr
JOIN events e ON e.id = rr.event_id
JOIN organizers o ON o.id = rr.organizer_id
WHERE rr.run_at > NOW() - INTERVAL '7 days'
ORDER BY rr.run_at DESC;

-- Get events with discrepancies
SELECT
  rr.*,
  e.title AS event_title,
  e.end_at,
  o.display_name AS organizer_name,
  jsonb_array_length(rr.issues) AS issue_count
FROM reconciliation_results rr
JOIN events e ON e.id = rr.event_id
JOIN organizers o ON o.id = rr.organizer_id
WHERE rr.has_discrepancies = TRUE
ORDER BY rr.run_at DESC;

-- Get reconciliation summary
SELECT
  COUNT(*) AS total_reconciliations,
  COUNT(*) FILTER (WHERE has_discrepancies = TRUE) AS with_discrepancies,
  COUNT(*) FILTER (WHERE has_discrepancies = FALSE) AS clean,
  AVG(revenue_discrepancy_cents) AS avg_discrepancy_cents
FROM reconciliation_results
WHERE run_at > NOW() - INTERVAL '30 days';

-- ============================================================================
-- TRUST TIER QUERIES
-- ============================================================================

-- Get organizers by trust tier
SELECT
  o.id,
  o.display_name,
  o.trust_tier,
  o.trust_score,
  o.events_completed,
  o.total_revenue_cents,
  o.chargeback_count,
  o.payout_delay_hours,
  COUNT(DISTINCT p.event_id) FILTER (WHERE p.status = 'completed') AS completed_events_count
FROM organizers o
LEFT JOIN payouts p ON p.organizer_id = o.id
GROUP BY o.id, o.display_name, o.trust_tier, o.trust_score, 
         o.events_completed, o.total_revenue_cents, o.chargeback_count, o.payout_delay_hours
ORDER BY o.trust_score DESC;

-- Get organizers eligible for tier upgrade
SELECT
  o.id,
  o.display_name,
  o.trust_tier AS current_tier,
  calculate_trust_tier(o.id) AS calculated_tier,
  o.events_completed,
  o.total_revenue_cents,
  o.chargeback_count
FROM organizers o
WHERE calculate_trust_tier(o.id) != o.trust_tier
  AND calculate_trust_tier(o.id) > o.trust_tier::text::trust_tier; -- Only upgrades

-- ============================================================================
-- PAYOUT SCHEDULE QUERIES
-- ============================================================================

-- Get payout schedule for an event
SELECT
  ps.*,
  e.title AS event_title,
  e.end_at AS event_end_at,
  calculate_payout_available_at(e.id, ps.organizer_id) AS available_at
FROM payout_schedules ps
JOIN events e ON e.id = ps.event_id
WHERE ps.event_id = 'event-uuid-here';

-- Get default payout schedules by trust tier
SELECT
  trust_tier,
  AVG(hold_delay_hours) AS avg_delay_hours,
  AVG(min_payout_amount_cents) AS avg_min_payout_cents
FROM payout_schedules
WHERE event_id IS NULL -- Organizer-level defaults
GROUP BY trust_tier;

-- ============================================================================
-- REFUND RESERVE QUERIES
-- ============================================================================

-- Get events with active refund reserves
SELECT
  el.event_id,
  e.title,
  e.end_at,
  el.refund_reserve_cents,
  el.refunds_issued_cents,
  CASE
    WHEN e.end_at > NOW() - INTERVAL '30 days' THEN 'Active'
    ELSE 'Expired'
  END AS reserve_status
FROM event_ledger el
JOIN events e ON e.id = el.event_id
WHERE el.refund_reserve_cents > 0
ORDER BY e.end_at DESC;

-- Calculate total refund reserves across platform
SELECT
  SUM(refund_reserve_cents) AS total_reserve_cents,
  COUNT(*) AS events_with_reserve
FROM event_ledger
WHERE refund_reserve_cents > 0;
