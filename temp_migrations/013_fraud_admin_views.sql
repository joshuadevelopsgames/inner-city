-- Admin Risk Review Views and Queries
-- Views for fraud detection and risk management

-- ============================================================================
-- ADMIN VIEWS
-- ============================================================================

-- High-risk users view
CREATE OR REPLACE VIEW admin_high_risk_users AS
SELECT
  urp.user_id,
  u.email,
  urp.risk_score,
  urp.risk_level,
  urp.is_blocked,
  urp.requires_phone_verification,
  urp.total_purchases,
  urp.total_refunds,
  CASE
    WHEN urp.total_purchases > 0 THEN
      ROUND((urp.total_refunds::DECIMAL / urp.total_purchases::DECIMAL) * 100, 2)
    ELSE 0
  END AS refund_rate_percent,
  urp.purchases_last_hour,
  urp.purchases_last_day,
  urp.purchases_last_week,
  COUNT(DISTINCT rs.id) AS active_signals_count,
  MAX(rs.created_at) AS latest_signal_at,
  urp.last_purchase_at,
  urp.first_purchase_at,
  urp.updated_at
FROM user_risk_profiles urp
JOIN auth.users u ON u.id = urp.user_id
LEFT JOIN risk_signals rs ON rs.user_id = urp.user_id AND rs.is_resolved = FALSE
WHERE urp.risk_level IN ('high', 'critical')
   OR urp.is_blocked = TRUE
GROUP BY urp.user_id, u.email, urp.risk_score, urp.risk_level, urp.is_blocked,
         urp.requires_phone_verification, urp.total_purchases, urp.total_refunds,
         urp.purchases_last_hour, urp.purchases_last_day, urp.purchases_last_week,
         urp.last_purchase_at, urp.first_purchase_at, urp.updated_at
ORDER BY urp.risk_score DESC, latest_signal_at DESC NULLS LAST;

-- Risk signals summary view
CREATE OR REPLACE VIEW admin_risk_signals_summary AS
SELECT
  rs.id,
  rs.signal_type,
  rs.risk_level,
  rs.confidence_score,
  rs.description,
  rs.is_resolved,
  rs.created_at,
  rs.resolved_at,
  rs.resolved_by,
  rs.user_id,
  u.email AS user_email,
  rs.organizer_id,
  o.display_name AS organizer_name,
  rs.event_id,
  e.title AS event_title,
  rs.device_id,
  rs.card_fingerprint,
  rs.ip_address,
  rs.metadata
FROM risk_signals rs
LEFT JOIN auth.users u ON u.id = rs.user_id
LEFT JOIN organizers o ON o.id = rs.organizer_id
LEFT JOIN events e ON e.id = rs.event_id
ORDER BY rs.created_at DESC;

-- Active risk actions view
CREATE OR REPLACE VIEW admin_active_risk_actions AS
SELECT
  ra.id,
  ra.action_type,
  ra.status,
  ra.description,
  ra.activated_at,
  ra.expires_at,
  ra.user_id,
  u.email AS user_email,
  ra.organizer_id,
  o.display_name AS organizer_name,
  ra.event_id,
  e.title AS event_title,
  ra.risk_signal_id,
  rs.signal_type AS signal_type,
  ra.metadata,
  ra.created_at,
  ra.updated_at
FROM risk_actions ra
LEFT JOIN auth.users u ON u.id = ra.user_id
LEFT JOIN organizers o ON o.id = ra.organizer_id
LEFT JOIN events e ON e.id = ra.event_id
LEFT JOIN risk_signals rs ON rs.id = ra.risk_signal_id
WHERE ra.status IN ('pending', 'active')
ORDER BY ra.created_at DESC;

-- Device risk summary view
CREATE OR REPLACE VIEW admin_device_risk_summary AS
SELECT
  drp.device_id,
  drp.user_id,
  u.email AS user_email,
  drp.risk_score,
  drp.is_blocked,
  drp.total_scans,
  drp.valid_scans,
  drp.invalid_scans,
  drp.failed_scans,
  CASE
    WHEN drp.total_scans > 0 THEN
      ROUND((drp.failed_scans::DECIMAL / drp.total_scans::DECIMAL) * 100, 2)
    ELSE 0
  END AS failure_rate_percent,
  drp.consecutive_failures,
  drp.last_failed_scan_at,
  drp.first_seen_at,
  drp.last_seen_at
FROM device_risk_profiles drp
LEFT JOIN auth.users u ON u.id = drp.user_id
WHERE drp.is_blocked = TRUE
   OR drp.consecutive_failures >= 5
   OR (drp.total_scans > 0 AND (drp.failed_scans::DECIMAL / drp.total_scans::DECIMAL) > 0.5)
ORDER BY drp.consecutive_failures DESC, drp.failure_rate_percent DESC;

-- Purchase rate limit violations view
CREATE OR REPLACE VIEW admin_rate_limit_violations AS
SELECT
  'user' AS violation_type,
  urp.user_id::TEXT AS entity_id,
  u.email AS entity_name,
  urp.purchases_last_hour AS current_count,
  rlc.max_per_hour AS limit_value,
  urp.purchases_last_hour - rlc.max_per_hour AS violation_amount,
  urp.last_purchase_at AS last_activity
FROM user_risk_profiles urp
JOIN auth.users u ON u.id = urp.user_id
CROSS JOIN (
  SELECT max_per_hour FROM rate_limit_configs
  WHERE limit_type = 'user' AND entity_id IS NULL AND is_active = TRUE
  LIMIT 1
) rlc
WHERE urp.purchases_last_hour > rlc.max_per_hour

UNION ALL

SELECT
  'card' AS violation_type,
  cf.fingerprint AS entity_id,
  'Card: ' || LEFT(cf.fingerprint, 8) || '...' AS entity_name,
  cf.purchases_last_hour AS current_count,
  rlc.max_per_hour AS limit_value,
  cf.purchases_last_hour - rlc.max_per_hour AS violation_amount,
  cf.last_seen_at AS last_activity
FROM card_fingerprints cf
CROSS JOIN (
  SELECT max_per_hour FROM rate_limit_configs
  WHERE limit_type = 'card' AND entity_id IS NULL AND is_active = TRUE
  LIMIT 1
) rlc
WHERE cf.purchases_last_hour > rlc.max_per_hour
  AND cf.is_blocked = FALSE

UNION ALL

SELECT
  'ip' AS violation_type,
  ip.ip_address::TEXT AS entity_id,
  ip.ip_address::TEXT AS entity_name,
  ip.purchases_last_hour AS current_count,
  rlc.max_per_hour AS limit_value,
  ip.purchases_last_hour - rlc.max_per_hour AS violation_amount,
  ip.last_seen_at AS last_activity
FROM ip_addresses ip
CROSS JOIN (
  SELECT max_per_hour FROM rate_limit_configs
  WHERE limit_type = 'ip' AND entity_id IS NULL AND is_active = TRUE
  LIMIT 1
) rlc
WHERE ip.purchases_last_hour > rlc.max_per_hour
  AND ip.is_blocked = FALSE
ORDER BY violation_amount DESC;

-- Organizer refund rate view
CREATE OR REPLACE VIEW admin_organizer_refund_rates AS
SELECT
  o.id AS organizer_id,
  o.display_name,
  o.trust_tier,
  COUNT(DISTINCT p.event_id) AS events_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'succeeded') AS total_payments,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'refunded') AS refunded_payments,
  CASE
    WHEN COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'succeeded') > 0 THEN
      ROUND(
        (COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'refunded')::DECIMAL /
         COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'succeeded')::DECIMAL) * 100,
        2
      )
    ELSE 0
  END AS refund_rate_percent,
  SUM(p.amount_cents) FILTER (WHERE p.status = 'succeeded') AS total_revenue_cents,
  SUM(p.amount_cents) FILTER (WHERE p.status = 'refunded') AS total_refunded_cents,
  MAX(p.created_at) FILTER (WHERE p.status = 'refunded') AS last_refund_at
FROM organizers o
LEFT JOIN payments p ON p.organizer_id = o.id
GROUP BY o.id, o.display_name, o.trust_tier
HAVING COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'succeeded') > 0
ORDER BY refund_rate_percent DESC;

-- ============================================================================
-- FUNCTIONS FOR ADMIN ACTIONS
-- ============================================================================

-- Block user
CREATE OR REPLACE FUNCTION admin_block_user(
  p_user_id UUID,
  p_reason TEXT,
  p_admin_user_id UUID
)
RETURNS risk_actions
LANGUAGE plpgsql
AS $$
DECLARE
  v_action risk_actions;
BEGIN
  -- Update user risk profile
  UPDATE user_risk_profiles
  SET is_blocked = TRUE, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Create risk action
  INSERT INTO risk_actions (
    action_type,
    status,
    user_id,
    description,
    metadata,
    activated_at
  ) VALUES (
    'block_account',
    'active',
    p_user_id,
    format('Account blocked: %s', p_reason),
    jsonb_build_object(
      'reason', p_reason,
      'blocked_by', p_admin_user_id,
      'blocked_at', NOW()
    ),
    NOW()
  )
  RETURNING * INTO v_action;
  
  RETURN v_action;
END;
$$;

-- Require phone verification
CREATE OR REPLACE FUNCTION admin_require_phone_verification(
  p_user_id UUID,
  p_reason TEXT,
  p_admin_user_id UUID
)
RETURNS risk_actions
LANGUAGE plpgsql
AS $$
DECLARE
  v_action risk_actions;
BEGIN
  -- Update user risk profile
  UPDATE user_risk_profiles
  SET requires_phone_verification = TRUE, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Create risk action
  INSERT INTO risk_actions (
    action_type,
    status,
    user_id,
    description,
    metadata,
    activated_at
  ) VALUES (
    'require_phone_verification',
    'active',
    p_user_id,
    format('Phone verification required: %s', p_reason),
    jsonb_build_object(
      'reason', p_reason,
      'required_by', p_admin_user_id,
      'required_at', NOW()
    ),
    NOW()
  )
  RETURNING * INTO v_action;
  
  RETURN v_action;
END;
$$;

-- Freeze transfers for event
CREATE OR REPLACE FUNCTION admin_freeze_transfers(
  p_event_id UUID,
  p_reason TEXT,
  p_admin_user_id UUID
)
RETURNS risk_actions
LANGUAGE plpgsql
AS $$
DECLARE
  v_action risk_actions;
BEGIN
  -- Create risk action
  INSERT INTO risk_actions (
    action_type,
    status,
    event_id,
    description,
    metadata,
    activated_at
  ) VALUES (
    'freeze_transfers',
    'active',
    p_event_id,
    format('Transfers frozen: %s', p_reason),
    jsonb_build_object(
      'reason', p_reason,
      'frozen_by', p_admin_user_id,
      'frozen_at', NOW()
    ),
    NOW()
  )
  RETURNING * INTO v_action;
  
  RETURN v_action;
END;
$$;

-- Resolve risk signal
CREATE OR REPLACE FUNCTION admin_resolve_risk_signal(
  p_signal_id UUID,
  p_resolution_notes TEXT,
  p_admin_user_id UUID
)
RETURNS risk_signals
LANGUAGE plpgsql
AS $$
DECLARE
  v_signal risk_signals;
BEGIN
  UPDATE risk_signals
  SET
    is_resolved = TRUE,
    resolved_at = NOW(),
    resolved_by = p_admin_user_id,
    resolution_notes = p_resolution_notes
  WHERE id = p_signal_id
  RETURNING * INTO v_signal;
  
  RETURN v_signal;
END;
$$;

-- Get risk dashboard stats
CREATE OR REPLACE FUNCTION admin_risk_dashboard_stats()
RETURNS TABLE (
  total_high_risk_users INTEGER,
  total_blocked_users INTEGER,
  total_active_signals INTEGER,
  total_critical_signals INTEGER,
  total_active_actions INTEGER,
  rate_limit_violations_count INTEGER,
  devices_with_failures INTEGER,
  high_refund_rate_organizers INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical'))::INTEGER,
    COUNT(*) FILTER (WHERE is_blocked = TRUE)::INTEGER,
    (SELECT COUNT(*)::INTEGER FROM risk_signals WHERE is_resolved = FALSE),
    (SELECT COUNT(*)::INTEGER FROM risk_signals WHERE risk_level = 'critical' AND is_resolved = FALSE),
    (SELECT COUNT(*)::INTEGER FROM risk_actions WHERE status IN ('pending', 'active')),
    (SELECT COUNT(*)::INTEGER FROM admin_rate_limit_violations),
    (SELECT COUNT(*)::INTEGER FROM device_risk_profiles WHERE consecutive_failures >= 5),
    (SELECT COUNT(*)::INTEGER FROM admin_organizer_refund_rates WHERE refund_rate_percent > 25)
  FROM user_risk_profiles;
END;
$$;
