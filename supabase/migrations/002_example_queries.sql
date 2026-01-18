-- Example Queries for Inner City Ticketing
-- These demonstrate common operations and fraud detection patterns

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================

-- 1. Remaining inventory for event
-- Shows current availability for an event
SELECT 
  e.id AS event_id,
  e.title,
  ti.total_capacity,
  ti.sold_count,
  ti.reserved_count,
  ti.available_count,
  ROUND((ti.sold_count::NUMERIC / ti.total_capacity::NUMERIC) * 100, 2) AS percent_sold
FROM events e
JOIN ticket_inventory ti ON ti.event_id = e.id
WHERE e.id = 'YOUR_EVENT_ID_HERE'
  AND e.status = 'active';

-- Alternative using the helper function
SELECT * FROM get_remaining_inventory('YOUR_EVENT_ID_HERE');

-- 2. Check-in counts by hour
-- Shows check-in activity over time for an event
SELECT 
  DATE_TRUNC('hour', created_at) AS check_in_hour,
  COUNT(*) FILTER (WHERE result = 'valid') AS valid_check_ins,
  COUNT(*) FILTER (WHERE result = 'already_used') AS duplicate_attempts,
  COUNT(*) FILTER (WHERE result = 'invalid') AS invalid_scans,
  COUNT(*) FILTER (WHERE result = 'expired') AS expired_tickets,
  COUNT(*) AS total_scans
FROM check_in_logs
WHERE event_id = 'YOUR_EVENT_ID_HERE'
  AND created_at >= (SELECT start_at FROM events WHERE id = 'YOUR_EVENT_ID_HERE')
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY check_in_hour;

-- 3. Fraud signals: Multiple failed scans per device
-- Identifies suspicious scanner devices with high failure rates
SELECT 
  scanner_device_id,
  scanner_user_id,
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE result != 'valid') AS failed_scans,
  COUNT(*) FILTER (WHERE result = 'valid') AS successful_scans,
  ROUND(
    (COUNT(*) FILTER (WHERE result != 'valid')::NUMERIC / COUNT(*)::NUMERIC) * 100, 
    2
  ) AS failure_rate_percent,
  MIN(created_at) AS first_scan,
  MAX(created_at) AS last_scan,
  COUNT(DISTINCT event_id) AS events_scanned
FROM check_in_logs
WHERE scanner_device_id IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY scanner_device_id, scanner_user_id
HAVING COUNT(*) FILTER (WHERE result != 'valid') >= 3 -- At least 3 failed scans
ORDER BY failed_scans DESC, failure_rate_percent DESC;

-- 4. Tickets by status for an event
-- Overview of ticket statuses for an organizer
SELECT 
  e.id AS event_id,
  e.title,
  t.status,
  COUNT(*) AS ticket_count,
  SUM(t.purchase_price_cents) AS total_revenue_cents
FROM events e
JOIN tickets t ON t.event_id = e.id
WHERE e.organizer_id = auth.uid()
GROUP BY e.id, e.title, t.status
ORDER BY e.start_at DESC, t.status;

-- 5. Recent transfers for a user
-- Shows ticket transfer history
SELECT 
  tt.id AS transfer_id,
  tt.status,
  tt.transfer_price_cents,
  e.title AS event_title,
  e.start_at,
  from_u.display_name AS from_user,
  to_u.display_name AS to_user,
  tt.created_at,
  tt.completed_at
FROM ticket_transfers tt
JOIN tickets t ON t.id = tt.ticket_id
JOIN events e ON e.id = t.event_id
LEFT JOIN auth.users from_u ON from_u.id = tt.from_user_id
LEFT JOIN auth.users to_u ON to_u.id = tt.to_user_id
WHERE tt.from_user_id = auth.uid() OR tt.to_user_id = auth.uid()
ORDER BY tt.created_at DESC
LIMIT 20;

-- 6. Check-in summary for staff scanner
-- Shows scanning activity for a staff member
SELECT 
  e.title AS event_title,
  e.start_at,
  COUNT(*) FILTER (WHERE result = 'valid') AS successful_check_ins,
  COUNT(*) FILTER (WHERE result = 'already_used') AS duplicate_attempts,
  COUNT(*) FILTER (WHERE result IN ('invalid', 'expired', 'revoked')) AS rejected_scans,
  COUNT(*) AS total_scans,
  MIN(created_at) AS first_scan,
  MAX(created_at) AS last_scan
FROM check_in_logs cil
JOIN events e ON e.id = cil.event_id
WHERE scanner_user_id = auth.uid()
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY e.id, e.title, e.start_at
ORDER BY e.start_at DESC;

-- 7. Revenue by event for organizer
-- Financial overview for organizers
SELECT 
  e.id AS event_id,
  e.title,
  e.start_at,
  COUNT(p.id) AS payment_count,
  SUM(p.amount_cents) AS total_revenue_cents,
  SUM(p.platform_fee_cents) AS platform_fees_cents,
  SUM(p.organizer_payout_cents) AS organizer_payout_cents,
  COUNT(*) FILTER (WHERE p.status = 'succeeded') AS successful_payments,
  COUNT(*) FILTER (WHERE p.status = 'refunded') AS refunded_payments,
  COUNT(*) FILTER (WHERE p.status = 'disputed') AS disputed_payments
FROM events e
LEFT JOIN payments p ON p.event_id = e.id
WHERE e.organizer_id = auth.uid()
GROUP BY e.id, e.title, e.start_at
ORDER BY e.start_at DESC;

-- 8. Active tickets for a user
-- Shows user's current ticket inventory
SELECT 
  t.id AS ticket_id,
  e.title AS event_title,
  e.start_at,
  e.venue_name,
  t.status,
  t.purchase_price_cents,
  t.purchased_at,
  CASE 
    WHEN t.expires_at < NOW() THEN 'expired'
    WHEN e.start_at < NOW() AND e.end_at > NOW() THEN 'live'
    WHEN e.start_at > NOW() THEN 'upcoming'
    ELSE 'past'
  END AS event_status
FROM tickets t
JOIN events e ON e.id = t.event_id
WHERE t.buyer_id = auth.uid()
  AND t.status IN ('active', 'transferred')
ORDER BY e.start_at ASC;

-- 9. Pending reports requiring review
-- For moderation dashboard
SELECT 
  er.id AS report_id,
  er.report_type,
  er.description,
  er.status,
  e.title AS event_title,
  e.organizer_id,
  o.display_name AS organizer_name,
  u.display_name AS reporter_name,
  er.created_at,
  COUNT(*) OVER (PARTITION BY er.event_id) AS total_reports_for_event
FROM event_reports er
JOIN events e ON e.id = er.event_id
JOIN organizers o ON o.id = e.organizer_id
JOIN auth.users u ON u.id = er.reporter_id
WHERE er.status = 'pending'
ORDER BY er.created_at ASC;

-- 10. Event performance metrics
-- Comprehensive event analytics
SELECT 
  e.id AS event_id,
  e.title,
  e.start_at,
  ti.total_capacity,
  ti.sold_count,
  ti.available_count,
  COUNT(DISTINCT t.id) AS total_tickets_issued,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'used') AS tickets_used,
  COUNT(DISTINCT cil.id) FILTER (WHERE cil.result = 'valid') AS check_ins_count,
  COUNT(DISTINCT cil.scanner_device_id) AS unique_scanner_devices,
  SUM(p.amount_cents) FILTER (WHERE p.status = 'succeeded') AS total_revenue_cents,
  COUNT(DISTINCT er.id) AS report_count
FROM events e
LEFT JOIN ticket_inventory ti ON ti.event_id = e.id
LEFT JOIN tickets t ON t.event_id = e.id
LEFT JOIN check_in_logs cil ON cil.event_id = e.id
LEFT JOIN payments p ON p.event_id = e.id
LEFT JOIN event_reports er ON er.event_id = e.id
WHERE e.organizer_id = auth.uid()
GROUP BY e.id, e.title, e.start_at, ti.total_capacity, ti.sold_count, ti.available_count
ORDER BY e.start_at DESC;

-- 11. Suspicious ticket patterns
-- Detects potential fraud patterns
SELECT 
  buyer_id,
  COUNT(*) AS ticket_count,
  COUNT(DISTINCT event_id) AS unique_events,
  SUM(purchase_price_cents) AS total_spent_cents,
  COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count,
  COUNT(*) FILTER (WHERE status = 'used') AS used_count,
  MIN(purchased_at) AS first_purchase,
  MAX(purchased_at) AS last_purchase
FROM tickets
WHERE purchased_at >= NOW() - INTERVAL '30 days'
GROUP BY buyer_id
HAVING 
  COUNT(*) > 10 -- More than 10 tickets
  OR COUNT(*) FILTER (WHERE status = 'refunded') > 3 -- More than 3 refunds
  OR (COUNT(*) > 5 AND COUNT(*) FILTER (WHERE status = 'used') = 0) -- Many tickets, none used
ORDER BY ticket_count DESC;

-- 12. Scanner device reliability
-- Identifies reliable vs problematic scanner devices
SELECT 
  sd.id AS device_id,
  sd.device_name,
  u.display_name AS scanner_name,
  COUNT(cil.id) AS total_scans,
  COUNT(*) FILTER (WHERE cil.result = 'valid') AS successful_scans,
  COUNT(*) FILTER (WHERE cil.result != 'valid') AS failed_scans,
  ROUND(
    (COUNT(*) FILTER (WHERE cil.result = 'valid')::NUMERIC / COUNT(cil.id)::NUMERIC) * 100,
    2
  ) AS success_rate_percent,
  sd.last_seen_at
FROM scanner_devices sd
JOIN auth.users u ON u.id = sd.user_id
LEFT JOIN check_in_logs cil ON cil.scanner_device_id = sd.id
WHERE sd.last_seen_at >= NOW() - INTERVAL '7 days'
GROUP BY sd.id, sd.device_name, u.display_name, sd.last_seen_at
HAVING COUNT(cil.id) > 0
ORDER BY success_rate_percent ASC, failed_scans DESC;

-- 13. Transfer activity by event
-- Shows transfer patterns for events
SELECT 
  e.id AS event_id,
  e.title,
  e.start_at,
  COUNT(tt.id) AS total_transfers,
  COUNT(*) FILTER (WHERE tt.status = 'completed') AS completed_transfers,
  COUNT(*) FILTER (WHERE tt.status = 'pending') AS pending_transfers,
  COUNT(*) FILTER (WHERE tt.status = 'cancelled') AS cancelled_transfers,
  SUM(tt.transfer_price_cents) FILTER (WHERE tt.status = 'completed') AS transfer_revenue_cents,
  AVG(tt.transfer_price_cents) FILTER (WHERE tt.status = 'completed') AS avg_transfer_price_cents
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id
LEFT JOIN ticket_transfers tt ON tt.ticket_id = t.id
WHERE e.organizer_id = auth.uid()
GROUP BY e.id, e.title, e.start_at
HAVING COUNT(tt.id) > 0
ORDER BY total_transfers DESC;

-- 14. Hourly check-in distribution
-- Shows peak check-in times
SELECT 
  EXTRACT(HOUR FROM created_at) AS hour_of_day,
  COUNT(*) FILTER (WHERE result = 'valid') AS valid_check_ins,
  COUNT(*) AS total_scans,
  ROUND(
    (COUNT(*) FILTER (WHERE result = 'valid')::NUMERIC / COUNT(*)::NUMERIC) * 100,
    2
  ) AS success_rate_percent
FROM check_in_logs
WHERE event_id = 'YOUR_EVENT_ID_HERE'
  AND created_at >= (SELECT start_at FROM events WHERE id = 'YOUR_EVENT_ID_HERE')
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour_of_day;

-- 15. Organizer verification status overview
-- Admin view of organizer verification
SELECT 
  o.id AS organizer_id,
  o.display_name,
  o.tier,
  o.verification_status,
  COUNT(e.id) AS total_events,
  COUNT(e.id) FILTER (WHERE e.status = 'active') AS active_events,
  COUNT(t.id) AS total_tickets_sold,
  SUM(p.amount_cents) FILTER (WHERE p.status = 'succeeded') AS total_revenue_cents,
  COUNT(DISTINCT er.id) AS report_count
FROM organizers o
LEFT JOIN events e ON e.organizer_id = o.id
LEFT JOIN tickets t ON t.event_id = e.id
LEFT JOIN payments p ON p.event_id = e.id
LEFT JOIN event_reports er ON er.event_id = e.id
GROUP BY o.id, o.display_name, o.tier, o.verification_status
ORDER BY total_revenue_cents DESC NULLS LAST;
