-- Trust Tier Upgrade Functions
-- Automatically upgrade organizers based on performance metrics

-- ============================================================================
-- TRUST TIER UPGRADE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_trust_tier(p_organizer_id UUID)
RETURNS trust_tier
LANGUAGE plpgsql
AS $$
DECLARE
  v_organizer organizers%ROWTYPE;
  v_chargeback_rate DECIMAL;
  v_tier trust_tier;
BEGIN
  -- Get organizer data
  SELECT * INTO v_organizer
  FROM organizers
  WHERE id = p_organizer_id;
  
  IF v_organizer IS NULL THEN
    RAISE EXCEPTION 'Organizer not found: %', p_organizer_id;
  END IF;
  
  -- Calculate chargeback rate
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE status = 'disputed')::DECIMAL / COUNT(*)::DECIMAL) * 100
    END INTO v_chargeback_rate
  FROM payments
  WHERE organizer_id = p_organizer_id
    AND status IN ('succeeded', 'disputed');
  
  -- Determine tier based on criteria
  -- Premium: 50+ events, $500k+ revenue, <0.5% chargeback rate
  IF v_organizer.events_completed >= 50
     AND v_organizer.total_revenue_cents >= 50000000
     AND v_chargeback_rate < 0.5 THEN
    v_tier := 'premium';
  
  -- Trusted: 20+ events, $100k+ revenue, <1% chargeback rate
  ELSIF v_organizer.events_completed >= 20
        AND v_organizer.total_revenue_cents >= 10000000
        AND v_chargeback_rate < 1.0 THEN
    v_tier := 'trusted';
  
  -- Verified: 5+ events, $10k+ revenue, 0 chargebacks
  ELSIF v_organizer.events_completed >= 5
        AND v_organizer.total_revenue_cents >= 1000000
        AND v_chargeback_rate = 0 THEN
    v_tier := 'verified';
  
  -- New (default)
  ELSE
    v_tier := 'new';
  END IF;
  
  RETURN v_tier;
END;
$$;

-- Update organizer trust tier
CREATE OR REPLACE FUNCTION update_trust_tier(p_organizer_id UUID)
RETURNS trust_tier
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_tier trust_tier;
  v_old_tier trust_tier;
  v_trust_score INTEGER;
BEGIN
  -- Get current tier
  SELECT trust_tier INTO v_old_tier
  FROM organizers
  WHERE id = p_organizer_id;
  
  -- Calculate new tier
  v_new_tier := calculate_trust_tier(p_organizer_id);
  
  -- Calculate trust score
  SELECT
    COALESCE(events_completed, 0) * 10 +
    COALESCE(total_revenue_cents, 0) / 10000 +
    CASE WHEN chargeback_count = 0 THEN 50 ELSE -chargeback_count * 100 END
  INTO v_trust_score
  FROM organizers
  WHERE id = p_organizer_id;
  
  -- Update organizer
  UPDATE organizers
  SET
    trust_tier = v_new_tier,
    trust_score = v_trust_score,
    payout_delay_hours = CASE v_new_tier
      WHEN 'premium' THEN 0
      WHEN 'trusted' THEN 0
      WHEN 'verified' THEN 12
      ELSE 48
    END,
    updated_at = NOW()
  WHERE id = p_organizer_id;
  
  -- Log tier change if upgraded
  IF v_new_tier != v_old_tier AND (
    (v_old_tier = 'new' AND v_new_tier IN ('verified', 'trusted', 'premium')) OR
    (v_old_tier = 'verified' AND v_new_tier IN ('trusted', 'premium')) OR
    (v_old_tier = 'trusted' AND v_new_tier = 'premium')
  ) THEN
    -- Could insert into audit log here
    RAISE NOTICE 'Organizer % upgraded from % to %', p_organizer_id, v_old_tier, v_new_tier;
  END IF;
  
  RETURN v_new_tier;
END;
$$;

-- Auto-update trust tier when event completes
CREATE OR REPLACE FUNCTION update_organizer_stats_on_event_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update when event status changes to 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Update organizer stats
    UPDATE organizers
    SET
      events_completed = events_completed + 1,
      total_revenue_cents = total_revenue_cents + (
        SELECT COALESCE(SUM(amount_cents), 0)
        FROM payments
        WHERE event_id = NEW.id
          AND status = 'succeeded'
      ),
      updated_at = NOW()
    WHERE id = NEW.organizer_id;
    
    -- Recalculate trust tier
    PERFORM update_trust_tier(NEW.organizer_id);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_organizer_stats
  AFTER UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_organizer_stats_on_event_complete();

-- Update trust tier when chargeback occurs
CREATE OR REPLACE FUNCTION update_trust_tier_on_chargeback()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update when payment status changes to 'disputed'
  IF NEW.status = 'disputed' AND OLD.status != 'disputed' THEN
    -- Increment chargeback count
    UPDATE organizers
    SET
      chargeback_count = chargeback_count + 1,
      updated_at = NOW()
    WHERE id = NEW.organizer_id;
    
    -- Recalculate trust tier (may downgrade)
    PERFORM update_trust_tier(NEW.organizer_id);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_trust_tier_on_chargeback
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_trust_tier_on_chargeback();
