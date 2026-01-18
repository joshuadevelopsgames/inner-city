-- Concurrency Test Scenarios for Reservation System
-- These queries simulate race conditions to verify atomicity

-- ============================================================================
-- TEST 1: Multiple users trying to reserve last tickets
-- ============================================================================

-- Scenario: Event has 5 tickets left, 10 users try to reserve 1 each simultaneously
-- Expected: Only 5 reservations succeed, 5 fail

-- Setup test event
INSERT INTO events (organizer_id, city_id, title, start_at, end_at, venue_name, tier, status)
VALUES (
  'test-organizer-id',
  'test-city-id',
  'Concurrency Test Event',
  NOW() + INTERVAL '7 days',
  NOW() + INTERVAL '7 days 4 hours',
  'Test Venue',
  'community',
  'active'
)
RETURNING id;

-- Initialize inventory with 5 tickets
INSERT INTO ticket_inventory (event_id, total_capacity, sold_count, reserved_count)
VALUES ('test-event-id', 100, 95, 0);

-- Simulate 10 concurrent reservation attempts
-- In real test, these would run in parallel transactions
DO $$
DECLARE
  v_reservation_id UUID;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
BEGIN
  FOR i IN 1..10 LOOP
    BEGIN
      -- Try to create reservation
      SELECT create_reservation(
        'test-event-id',
        NULL,
        'user-' || i::text,
        1,
        10
      ) INTO v_reservation_id;
      
      IF v_reservation_id IS NOT NULL THEN
        v_success_count := v_success_count + 1;
        RAISE NOTICE 'Reservation % succeeded: %', i, v_reservation_id;
      ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'Reservation % failed: insufficient inventory', i;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail_count := v_fail_count + 1;
      RAISE NOTICE 'Reservation % error: %', i, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Results: % succeeded, % failed', v_success_count, v_fail_count;
  
  -- Verify inventory integrity
  ASSERT (
    SELECT (sold_count + reserved_count) <= total_capacity
    FROM ticket_inventory
    WHERE event_id = 'test-event-id'
  ), 'Inventory constraint violated!';
  
  RAISE NOTICE 'Inventory integrity check passed';
END $$;

-- ============================================================================
-- TEST 2: Reservation expiration and cleanup
-- ============================================================================

-- Create expired reservation
INSERT INTO reservations (event_id, user_id, quantity, expires_at, status)
VALUES (
  'test-event-id',
  'test-user-id',
  2,
  NOW() - INTERVAL '1 minute', -- Already expired
  'pending'
)
RETURNING id;

-- Verify cleanup function releases inventory
SELECT cleanup_expired_reservations();

-- Verify reservation is marked expired
SELECT 
  id,
  status,
  (SELECT reserved_count FROM ticket_inventory WHERE event_id = 'test-event-id') AS current_reserved
FROM reservations
WHERE id = 'last-inserted-reservation-id';

-- ============================================================================
-- TEST 3: Double consumption prevention (idempotency)
-- ============================================================================

-- Create reservation
SELECT create_reservation(
  'test-event-id',
  NULL,
  'test-user-id',
  1,
  10
) INTO v_reservation_id;

-- Try to consume twice
BEGIN;
  SELECT consume_reservation(v_reservation_id, 'test-session-1');
  -- Should succeed
COMMIT;

BEGIN;
  SELECT consume_reservation(v_reservation_id, 'test-session-2');
  -- Should fail with "already consumed" error
  -- This tests idempotency
COMMIT;

-- ============================================================================
-- TEST 4: Concurrent reservation and consumption
-- ============================================================================

-- Simulate: User reserves, then immediately pays (concurrent operations)
DO $$
DECLARE
  v_reservation_id UUID;
  v_consumed BOOLEAN;
BEGIN
  -- Create reservation in transaction 1
  BEGIN
    SELECT create_reservation(
      'test-event-id',
      NULL,
      'test-user-id',
      1,
      10
    ) INTO v_reservation_id;
    
    -- Immediately try to consume (simulating concurrent payment)
    SELECT consume_reservation(v_reservation_id, 'test-session') INTO v_consumed;
    
    ASSERT v_consumed = TRUE, 'Consumption should succeed';
    RAISE NOTICE 'Reservation created and consumed successfully';
  END;
END $$;

-- ============================================================================
-- TEST 5: Verify inventory never goes negative
-- ============================================================================

-- Set inventory to 0 available
UPDATE ticket_inventory
SET sold_count = 100, reserved_count = 0
WHERE event_id = 'test-event-id';

-- Try to reserve (should fail)
SELECT create_reservation(
  'test-event-id',
  NULL,
  'test-user-id',
  1,
  10
);

-- Should return NULL (no reservation created)
-- Verify inventory unchanged
SELECT 
  total_capacity,
  sold_count,
  reserved_count,
  available_count
FROM ticket_inventory
WHERE event_id = 'test-event-id';
-- Should still be: 100, 100, 0, 0

-- ============================================================================
-- TEST 6: Multiple reservations for same user
-- ============================================================================

-- User tries to reserve multiple times
DO $$
DECLARE
  v_res1 UUID;
  v_res2 UUID;
BEGIN
  -- First reservation
  SELECT create_reservation('test-event-id', NULL, 'same-user', 2, 10) INTO v_res1;
  
  -- Second reservation (should still work if inventory allows)
  SELECT create_reservation('test-event-id', NULL, 'same-user', 1, 10) INTO v_res2;
  
  RAISE NOTICE 'User has % active reservations', (
    SELECT COUNT(*) FROM reservations 
    WHERE user_id = 'same-user' AND status = 'pending'
  );
END $$;
