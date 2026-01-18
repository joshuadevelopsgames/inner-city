-- Add is_high_demand flag to events table
-- Used for stricter rate limits and captcha requirements

ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_high_demand BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_events_high_demand ON events(is_high_demand) WHERE is_high_demand = TRUE;

-- Add default rate limit configs
INSERT INTO rate_limit_configs (limit_type, entity_id, max_per_hour, max_per_day, max_per_week, high_demand_max_per_hour, high_demand_max_per_day, is_active)
VALUES
  ('user', NULL, 5, 20, 50, 2, 10, TRUE),
  ('card', NULL, 5, 20, 50, 2, 10, TRUE),
  ('ip', NULL, 5, 20, 50, 2, 10, TRUE),
  ('event', NULL, 5, 20, 50, 2, 10, TRUE)
ON CONFLICT (limit_type, entity_id) DO NOTHING;
