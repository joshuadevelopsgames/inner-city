-- Fraud and Abuse Detection System
-- Anti-fraud protections for underground events

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE risk_signal_type AS ENUM (
  'rate_limit_exceeded',
  'failed_scan_repeated',
  'high_refund_rate',
  'purchase_spike',
  'transfer_spam',
  'bot_activity',
  'chargeback',
  'suspicious_device',
  'multiple_accounts',
  'card_testing'
);
CREATE TYPE risk_action_type AS ENUM (
  'throttle',
  'require_phone_verification',
  'force_online_validation',
  'freeze_transfers',
  'require_captcha',
  'block_account',
  'flag_for_review'
);
CREATE TYPE action_status AS ENUM ('pending', 'active', 'resolved', 'expired');

-- ============================================================================
-- RISK TRACKING TABLES
-- ============================================================================

-- User risk profiles
CREATE TABLE user_risk_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level risk_level DEFAULT 'low' NOT NULL,
  
  -- Rate limiting counters
  purchases_last_hour INTEGER DEFAULT 0,
  purchases_last_day INTEGER DEFAULT 0,
  purchases_last_week INTEGER DEFAULT 0,
  
  -- Risk flags
  is_blocked BOOLEAN DEFAULT FALSE,
  requires_phone_verification BOOLEAN DEFAULT FALSE,
  phone_verified_at TIMESTAMPTZ,
  
  -- Metadata
  last_purchase_at TIMESTAMPTZ,
  first_purchase_at TIMESTAMPTZ,
  total_purchases INTEGER DEFAULT 0,
  total_refunds INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_risk_score ON user_risk_profiles(risk_score);
CREATE INDEX idx_user_risk_level ON user_risk_profiles(risk_level);
CREATE INDEX idx_user_risk_blocked ON user_risk_profiles(is_blocked) WHERE is_blocked = TRUE;

-- Card fingerprint tracking
CREATE TABLE card_fingerprints (
  fingerprint TEXT PRIMARY KEY, -- SHA256 hash of card details
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Rate limiting
  purchases_last_hour INTEGER DEFAULT 0,
  purchases_last_day INTEGER DEFAULT 0,
  purchases_last_week INTEGER DEFAULT 0,
  
  -- Risk flags
  is_blocked BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  total_purchases INTEGER DEFAULT 0,
  total_failed_attempts INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_fingerprint_user ON card_fingerprints(user_id);
CREATE INDEX idx_card_fingerprint_blocked ON card_fingerprints(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX idx_card_fingerprint_risk ON card_fingerprints(risk_score);

-- IP address tracking
CREATE TABLE ip_addresses (
  ip_address INET PRIMARY KEY,
  
  -- Rate limiting
  purchases_last_hour INTEGER DEFAULT 0,
  purchases_last_day INTEGER DEFAULT 0,
  purchases_last_week INTEGER DEFAULT 0,
  
  -- Risk flags
  is_blocked BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  total_purchases INTEGER DEFAULT 0,
  total_failed_attempts INTEGER DEFAULT 0,
  unique_users_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ip_blocked ON ip_addresses(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX idx_ip_risk ON ip_addresses(risk_score);

-- Risk signals (detected fraud indicators)
CREATE TABLE risk_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type risk_signal_type NOT NULL,
  risk_level risk_level NOT NULL,
  
  -- References
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  device_id TEXT,
  card_fingerprint TEXT REFERENCES card_fingerprints(fingerprint) ON DELETE SET NULL,
  ip_address INET REFERENCES ip_addresses(ip_address) ON DELETE SET NULL,
  
  -- Signal data
  description TEXT NOT NULL,
  metadata JSONB,
  confidence_score DECIMAL(5, 2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
  
  -- Status
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_risk_signals_type ON risk_signals(signal_type);
CREATE INDEX idx_risk_signals_level ON risk_signals(risk_level);
CREATE INDEX idx_risk_signals_user ON risk_signals(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_risk_signals_organizer ON risk_signals(organizer_id) WHERE organizer_id IS NOT NULL;
CREATE INDEX idx_risk_signals_event ON risk_signals(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_risk_signals_unresolved ON risk_signals(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_risk_signals_created ON risk_signals(created_at DESC);

-- Risk actions (automated responses to fraud)
CREATE TABLE risk_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type risk_action_type NOT NULL,
  status action_status DEFAULT 'pending' NOT NULL,
  
  -- References
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  risk_signal_id UUID REFERENCES risk_signals(id) ON DELETE SET NULL,
  
  -- Action details
  description TEXT NOT NULL,
  metadata JSONB,
  
  -- Timing
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_actions_type ON risk_actions(action_type);
CREATE INDEX idx_risk_actions_status ON risk_actions(status);
CREATE INDEX idx_risk_actions_user ON risk_actions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_risk_actions_active ON risk_actions(status) WHERE status = 'active';
CREATE INDEX idx_risk_actions_expires ON risk_actions(expires_at) WHERE expires_at IS NOT NULL;

-- Device risk tracking (for scanner fraud)
CREATE TABLE device_risk_profiles (
  device_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Scan statistics
  total_scans INTEGER DEFAULT 0,
  valid_scans INTEGER DEFAULT 0,
  invalid_scans INTEGER DEFAULT 0,
  failed_scans INTEGER DEFAULT 0,
  
  -- Risk flags
  is_blocked BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_failed_scan_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_risk_user ON device_risk_profiles(user_id);
CREATE INDEX idx_device_risk_blocked ON device_risk_profiles(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX idx_device_risk_score ON device_risk_profiles(risk_score);
CREATE INDEX idx_device_consecutive_failures ON device_risk_profiles(consecutive_failures) WHERE consecutive_failures > 0;

-- Purchase rate limits configuration
CREATE TABLE rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_type TEXT NOT NULL CHECK (limit_type IN ('user', 'card', 'ip', 'event')),
  entity_id UUID, -- event_id for event-specific limits, NULL for global
  
  -- Limits
  max_per_hour INTEGER DEFAULT 5,
  max_per_day INTEGER DEFAULT 20,
  max_per_week INTEGER DEFAULT 50,
  
  -- High-demand event overrides
  high_demand_max_per_hour INTEGER DEFAULT 2,
  high_demand_max_per_day INTEGER DEFAULT 10,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(limit_type, entity_id)
);

CREATE INDEX idx_rate_limit_config_type ON rate_limit_configs(limit_type);
CREATE INDEX idx_rate_limit_config_active ON rate_limit_configs(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check purchase rate limits
CREATE OR REPLACE FUNCTION check_purchase_rate_limit(
  p_user_id UUID,
  p_card_fingerprint TEXT,
  p_ip_address INET,
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  limit_type TEXT,
  current_count INTEGER,
  max_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_limit RECORD;
  v_card_limit RECORD;
  v_ip_limit RECORD;
  v_event_limit RECORD;
  v_config RECORD;
  v_is_high_demand BOOLEAN;
BEGIN
  -- Check if event is high-demand
  SELECT is_high_demand INTO v_is_high_demand
  FROM events
  WHERE id = p_event_id;
  
  -- Get rate limit config
  SELECT * INTO v_config
  FROM rate_limit_configs
  WHERE limit_type = 'event'
    AND entity_id = p_event_id
    AND is_active = TRUE;
  
  IF v_config IS NULL THEN
    SELECT * INTO v_config
    FROM rate_limit_configs
    WHERE limit_type = 'event'
      AND entity_id IS NULL
      AND is_active = TRUE;
  END IF;
  
  -- Default limits if no config
  IF v_config IS NULL THEN
    v_config := ROW(
      NULL, 'event', NULL,
      CASE WHEN v_is_high_demand THEN 2 ELSE 5 END,
      CASE WHEN v_is_high_demand THEN 10 ELSE 20 END,
      50,
      NULL, NULL, TRUE, NOW(), NOW()
    )::rate_limit_configs;
  END IF;
  
  -- Check user limits
  SELECT purchases_last_hour, purchases_last_day INTO v_user_limit
  FROM user_risk_profiles
  WHERE user_id = p_user_id;
  
  IF v_user_limit.purchases_last_hour >= v_config.max_per_hour THEN
    RETURN QUERY SELECT FALSE, 'User rate limit exceeded', 'user', 
      v_user_limit.purchases_last_hour, v_config.max_per_hour;
    RETURN;
  END IF;
  
  -- Check card fingerprint limits
  IF p_card_fingerprint IS NOT NULL THEN
    SELECT purchases_last_hour, purchases_last_day INTO v_card_limit
    FROM card_fingerprints
    WHERE fingerprint = p_card_fingerprint;
    
    IF v_card_limit.purchases_last_hour >= v_config.max_per_hour THEN
      RETURN QUERY SELECT FALSE, 'Card rate limit exceeded', 'card',
        v_card_limit.purchases_last_hour, v_config.max_per_hour;
      RETURN;
    END IF;
  END IF;
  
  -- Check IP limits
  IF p_ip_address IS NOT NULL THEN
    SELECT purchases_last_hour, purchases_last_day INTO v_ip_limit
    FROM ip_addresses
    WHERE ip_address = p_ip_address;
    
    IF v_ip_limit.purchases_last_hour >= v_config.max_per_hour THEN
      RETURN QUERY SELECT FALSE, 'IP rate limit exceeded', 'ip',
        v_ip_limit.purchases_last_hour, v_config.max_per_hour;
      RETURN;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT TRUE, 'Rate limit OK', 'none', 0, 0;
END;
$$;

-- Record purchase attempt
CREATE OR REPLACE FUNCTION record_purchase_attempt(
  p_user_id UUID,
  p_card_fingerprint TEXT,
  p_ip_address INET,
  p_success BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update user risk profile
  INSERT INTO user_risk_profiles (user_id, purchases_last_hour, purchases_last_day, purchases_last_week, total_purchases, last_purchase_at, first_purchase_at, updated_at)
  VALUES (
    p_user_id,
    1, 1, 1,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN NOW() ELSE NULL END,
    CASE WHEN p_success THEN NOW() ELSE NULL END,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    purchases_last_hour = user_risk_profiles.purchases_last_hour + 1,
    purchases_last_day = user_risk_profiles.purchases_last_day + 1,
    purchases_last_week = user_risk_profiles.purchases_last_week + 1,
    total_purchases = user_risk_profiles.total_purchases + CASE WHEN p_success THEN 1 ELSE 0 END,
    last_purchase_at = CASE WHEN p_success THEN NOW() ELSE user_risk_profiles.last_purchase_at END,
    first_purchase_at = COALESCE(user_risk_profiles.first_purchase_at, CASE WHEN p_success THEN NOW() ELSE NULL END),
    updated_at = NOW();
  
  -- Update card fingerprint
  IF p_card_fingerprint IS NOT NULL THEN
    INSERT INTO card_fingerprints (fingerprint, user_id, purchases_last_hour, purchases_last_day, purchases_last_week, total_purchases, total_failed_attempts, last_seen_at, updated_at)
    VALUES (
      p_card_fingerprint,
      p_user_id,
      1, 1, 1,
      CASE WHEN p_success THEN 1 ELSE 0 END,
      CASE WHEN p_success THEN 0 ELSE 1 END,
      NOW(),
      NOW()
    )
    ON CONFLICT (fingerprint) DO UPDATE SET
      user_id = COALESCE(card_fingerprints.user_id, p_user_id),
      purchases_last_hour = card_fingerprints.purchases_last_hour + 1,
      purchases_last_day = card_fingerprints.purchases_last_day + 1,
      purchases_last_week = card_fingerprints.purchases_last_week + 1,
      total_purchases = card_fingerprints.total_purchases + CASE WHEN p_success THEN 1 ELSE 0 END,
      total_failed_attempts = card_fingerprints.total_failed_attempts + CASE WHEN p_success THEN 0 ELSE 1 END,
      last_seen_at = NOW(),
      updated_at = NOW();
  END IF;
  
  -- Update IP address
  IF p_ip_address IS NOT NULL THEN
    INSERT INTO ip_addresses (ip_address, purchases_last_hour, purchases_last_day, purchases_last_week, total_purchases, total_failed_attempts, last_seen_at, updated_at)
    VALUES (
      p_ip_address,
      1, 1, 1,
      CASE WHEN p_success THEN 1 ELSE 0 END,
      CASE WHEN p_success THEN 0 ELSE 1 END,
      NOW(),
      NOW()
    )
    ON CONFLICT (ip_address) DO UPDATE SET
      purchases_last_hour = ip_addresses.purchases_last_hour + 1,
      purchases_last_day = ip_addresses.purchases_last_day + 1,
      purchases_last_week = ip_addresses.purchases_last_week + 1,
      total_purchases = ip_addresses.total_purchases + CASE WHEN p_success THEN 1 ELSE 0 END,
      total_failed_attempts = ip_addresses.total_failed_attempts + CASE WHEN p_success THEN 0 ELSE 1 END,
      unique_users_count = CASE WHEN NOT EXISTS (
        SELECT 1 FROM card_fingerprints WHERE fingerprint = p_card_fingerprint AND user_id != p_user_id
      ) THEN ip_addresses.unique_users_count ELSE ip_addresses.unique_users_count + 1 END,
      last_seen_at = NOW(),
      updated_at = NOW();
  END IF;
END;
$$;

-- Detect failed scan pattern
CREATE OR REPLACE FUNCTION detect_failed_scan_pattern(p_device_id TEXT)
RETURNS risk_signals
LANGUAGE plpgsql
AS $$
DECLARE
  v_device device_risk_profiles%ROWTYPE;
  v_signal risk_signals;
  v_failure_rate DECIMAL;
BEGIN
  -- Get device stats
  SELECT * INTO v_device
  FROM device_risk_profiles
  WHERE device_id = p_device_id;
  
  IF v_device IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate failure rate
  IF v_device.total_scans > 0 THEN
    v_failure_rate := (v_device.failed_scans::DECIMAL / v_device.total_scans::DECIMAL) * 100;
  ELSE
    v_failure_rate := 0;
  END IF;
  
  -- Detect pattern: >50% failure rate or >5 consecutive failures
  IF v_failure_rate > 50 OR v_device.consecutive_failures >= 5 THEN
    INSERT INTO risk_signals (
      signal_type,
      risk_level,
      device_id,
      description,
      confidence_score,
      metadata
    ) VALUES (
      'failed_scan_repeated',
      CASE
        WHEN v_device.consecutive_failures >= 10 THEN 'critical'
        WHEN v_device.consecutive_failures >= 5 THEN 'high'
        ELSE 'medium'
      END,
      p_device_id,
      format('Device has %s consecutive failures and %.1f%% failure rate', 
        v_device.consecutive_failures, v_failure_rate),
      LEAST(v_failure_rate, 100),
      jsonb_build_object(
        'device_id', p_device_id,
        'consecutive_failures', v_device.consecutive_failures,
        'failure_rate', v_failure_rate,
        'total_scans', v_device.total_scans,
        'failed_scans', v_device.failed_scans
      )
    )
    RETURNING * INTO v_signal;
    
    RETURN v_signal;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Detect purchase spike
CREATE OR REPLACE FUNCTION detect_purchase_spike(p_event_id UUID)
RETURNS risk_signals
LANGUAGE plpgsql
AS $$
DECLARE
  v_spike_threshold INTEGER := 50; -- Purchases in last hour
  v_recent_purchases INTEGER;
  v_avg_purchases DECIMAL;
  v_signal risk_signals;
BEGIN
  -- Count recent purchases
  SELECT COUNT(*) INTO v_recent_purchases
  FROM payments
  WHERE event_id = p_event_id
    AND created_at > NOW() - INTERVAL '1 hour'
    AND status = 'succeeded';
  
  -- Calculate average purchases per hour (last 24 hours)
  SELECT AVG(hourly_count) INTO v_avg_purchases
  FROM (
    SELECT COUNT(*) AS hourly_count
    FROM payments
    WHERE event_id = p_event_id
      AND created_at > NOW() - INTERVAL '24 hours'
      AND status = 'succeeded'
    GROUP BY DATE_TRUNC('hour', created_at)
  ) hourly_stats;
  
  -- Detect spike: >3x average or >threshold
  IF v_recent_purchases > v_spike_threshold OR 
     (v_avg_purchases > 0 AND v_recent_purchases > v_avg_purchases * 3) THEN
    INSERT INTO risk_signals (
      signal_type,
      risk_level,
      event_id,
      description,
      confidence_score,
      metadata
    ) VALUES (
      'purchase_spike',
      CASE
        WHEN v_recent_purchases > 100 THEN 'critical'
        WHEN v_recent_purchases > 50 THEN 'high'
        ELSE 'medium'
      END,
      p_event_id,
      format('Purchase spike detected: %s purchases in last hour (avg: %.1f)', 
        v_recent_purchases, v_avg_purchases),
      LEAST((v_recent_purchases / NULLIF(v_avg_purchases, 0)) * 20, 100),
      jsonb_build_object(
        'event_id', p_event_id,
        'recent_purchases', v_recent_purchases,
        'avg_purchases', v_avg_purchases,
        'spike_ratio', CASE WHEN v_avg_purchases > 0 THEN v_recent_purchases / v_avg_purchases ELSE 0 END
      )
    )
    RETURNING * INTO v_signal;
    
    RETURN v_signal;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Detect transfer spam (many transfers near event start)
CREATE OR REPLACE FUNCTION detect_transfer_spam(p_event_id UUID)
RETURNS risk_signals
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_start TIMESTAMPTZ;
  v_transfers_near_start INTEGER;
  v_signal risk_signals;
BEGIN
  -- Get event start time
  SELECT start_at INTO v_event_start
  FROM events
  WHERE id = p_event_id;
  
  -- Count transfers in 24 hours before event start
  SELECT COUNT(*) INTO v_transfers_near_start
  FROM ticket_transfers tt
  JOIN tickets t ON t.id = tt.ticket_id
  WHERE t.event_id = p_event_id
    AND tt.status = 'completed'
    AND tt.completed_at BETWEEN v_event_start - INTERVAL '24 hours' AND v_event_start;
  
  -- Detect spam: >20 transfers near event start
  IF v_transfers_near_start > 20 THEN
    INSERT INTO risk_signals (
      signal_type,
      risk_level,
      event_id,
      description,
      confidence_score,
      metadata
    ) VALUES (
      'transfer_spam',
      CASE
        WHEN v_transfers_near_start > 50 THEN 'critical'
        WHEN v_transfers_near_start > 30 THEN 'high'
        ELSE 'medium'
      END,
      p_event_id,
      format('Transfer spam detected: %s transfers in 24h before event start', 
        v_transfers_near_start),
      LEAST(v_transfers_near_start * 2, 100),
      jsonb_build_object(
        'event_id', p_event_id,
        'transfers_count', v_transfers_near_start,
        'event_start', v_event_start
      )
    )
    RETURNING * INTO v_signal;
    
    RETURN v_signal;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Calculate user risk score
CREATE OR REPLACE FUNCTION calculate_user_risk_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score INTEGER := 0;
  v_profile user_risk_profiles%ROWTYPE;
  v_refund_rate DECIMAL;
  v_recent_signals INTEGER;
BEGIN
  SELECT * INTO v_profile
  FROM user_risk_profiles
  WHERE user_id = p_user_id;
  
  IF v_profile IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Base score from purchase patterns
  IF v_profile.purchases_last_hour > 10 THEN
    v_score := v_score + 20;
  END IF;
  
  IF v_profile.purchases_last_day > 30 THEN
    v_score := v_score + 15;
  END IF;
  
  -- Refund rate penalty
  IF v_profile.total_purchases > 0 THEN
    v_refund_rate := (v_profile.total_refunds::DECIMAL / v_profile.total_purchases::DECIMAL) * 100;
    IF v_refund_rate > 50 THEN
      v_score := v_score + 30;
    ELSIF v_refund_rate > 25 THEN
      v_score := v_score + 15;
    END IF;
  END IF;
  
  -- Recent risk signals
  SELECT COUNT(*) INTO v_recent_signals
  FROM risk_signals
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '7 days'
    AND is_resolved = FALSE;
  
  v_score := v_score + (v_recent_signals * 10);
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update user risk score when profile changes
CREATE OR REPLACE FUNCTION update_user_risk_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score INTEGER;
  v_level risk_level;
BEGIN
  v_score := calculate_user_risk_score(NEW.user_id);
  
  -- Determine risk level
  IF v_score >= 80 THEN
    v_level := 'critical';
  ELSIF v_score >= 60 THEN
    v_level := 'high';
  ELSIF v_score >= 40 THEN
    v_level := 'medium';
  ELSE
    v_level := 'low';
  END IF;
  
  NEW.risk_score := v_score;
  NEW.risk_level := v_level;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_user_risk_score
  BEFORE INSERT OR UPDATE ON user_risk_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_risk_score();

-- Auto-create risk profile on first purchase
CREATE OR REPLACE FUNCTION create_user_risk_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_risk_profiles (user_id)
  VALUES (NEW.buyer_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_create_user_risk_profile
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION create_user_risk_profile();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE user_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_actions ENABLE ROW LEVEL SECURITY;

-- Users can view own risk profile
CREATE POLICY "Users can view own risk profile"
  ON user_risk_profiles FOR SELECT
  USING (user_id = auth.uid());

-- Only service role can insert/update risk data
-- (Edge Functions will handle this)
