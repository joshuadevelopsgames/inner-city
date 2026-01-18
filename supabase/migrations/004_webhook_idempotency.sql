-- Webhook Event Tracking for Idempotency
-- Prevents duplicate processing of Stripe webhooks

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reservation_id UUID REFERENCES reservations(id),
  result JSONB, -- Store processing result for debugging
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_reservation ON webhook_events(reservation_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed_at);

-- RLS: Only service role can access
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies needed - only service role (Edge Functions) access this table
