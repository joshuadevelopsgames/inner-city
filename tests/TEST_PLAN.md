# End-to-End Integration Test Plan

## Overview

Comprehensive test suite validating critical system invariants for Inner City ticketing platform.

## Test Framework

- **Framework**: Deno Test
- **Database**: Supabase (PostgreSQL)
- **Edge Functions**: Supabase Edge Functions
- **Run Command**: `deno test --allow-net --allow-env tests/e2e-invariants.test.ts`

## Critical Invariants

### 1. Inventory Never Negative ✅

**Test**: `test_inventory_never_negative`
- Simulate 100 concurrent purchase attempts for 50 available tickets
- Verify: `sold_count + reserved_count <= total_capacity` always holds
- Verify: No negative inventory values
- Verify: Exactly 50 successful purchases

**Edge Cases**:
- Concurrent reservations
- Concurrent checkout completions
- Reservation expiration during checkout
- Partial checkout failures

### 2. Ticket Check-In Once ✅

**Test**: `test_ticket_checkin_once`
- Create ticket
- Check in on Device A (should succeed)
- Attempt check-in on Device B (should fail - already used)
- Attempt check-in on Device A again (should fail - already used)
- Verify: Only one successful check-in log exists
- Verify: Ticket status is 'used'

**Edge Cases**:
- Offline scan then online scan
- Concurrent scans from different devices
- Scan after refund
- Scan after transfer

### 3. Webhook Idempotency ✅

**Test**: `test_webhook_idempotency`
- Process webhook event (should succeed)
- Process same webhook event again (should be idempotent)
- Verify: Only one ticket created
- Verify: Only one payment record
- Verify: Inventory updated once
- Verify: Webhook event marked as processed

**Edge Cases**:
- Duplicate webhook delivery
- Webhook retry after failure
- Webhook with same idempotency key
- Webhook with different payload but same event

### 4. Transfer Ownership ✅

**Test**: `test_transfer_ownership`
- User A purchases ticket
- User A transfers ticket to User B
- Verify: Ticket `buyer_id` updated to User B
- Verify: Transfer log created
- Verify: User A cannot check in ticket
- Verify: User B can check in ticket
- Verify: Audit trail preserved

**Edge Cases**:
- Transfer after check-in (should fail)
- Transfer after refund (should fail)
- Transfer to same user (should fail)
- Concurrent transfer attempts

### 5. Refund Invalidation ✅

**Test**: `test_refund_invalidation`
- Purchase ticket
- Check in ticket (should succeed)
- Refund ticket
- Verify: Ticket status is 'refunded'
- Verify: Payment status is 'refunded'
- Verify: Attempted check-in after refund (should fail)
- Verify: Refund amount matches purchase amount

**Edge Cases**:
- Partial refund
- Refund after check-in
- Refund after transfer
- Multiple refund attempts

### 6. Offline Scan Reconciliation ✅

**Test**: `test_offline_scan_reconciliation`
- Device A scans ticket offline (marks as used locally)
- Device B scans same ticket offline (marks as used locally)
- Device A syncs online (should succeed)
- Device B syncs online (should detect conflict)
- Verify: Only one successful check-in in database
- Verify: Conflict detected and resolved
- Verify: Local cache updated correctly

**Edge Cases**:
- Multiple devices scanning same ticket offline
- Network interruption during sync
- Stale cache reconciliation
- Concurrent sync attempts

## Chaos Test

### Concurrency Stress Test

**Test**: `chaos_test_concurrent_operations`
- Simulate 500 simultaneous operations:
  - 200 purchase attempts
  - 150 check-in attempts
  - 100 transfer attempts
  - 50 refund attempts
- Verify all invariants hold:
  - Inventory never negative
  - Tickets checked in once
  - No duplicate webhooks
  - Transfers valid
  - Refunds processed correctly

## Test Structure

```
tests/
├── TEST_PLAN.md (this file)
├── e2e-invariants.test.ts (main test suite)
├── chaos-concurrency.test.ts (stress test)
└── test-helpers.ts (shared utilities)
```

## Test Data Management

- Each test creates its own test data
- Tests clean up after themselves
- Use UUIDs for all test entities
- Isolated test contexts prevent interference

## Running Tests

### Run All Tests
```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts
```

### Run Specific Test
```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts -A test_inventory_never_negative
```

### Run Chaos Test
```bash
deno test --allow-net --allow-env tests/chaos-concurrency.test.ts
```

### Run with Verbose Output
```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts --verbose
```

## Environment Variables

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (for webhook tests)

## Success Criteria

All tests must:
1. ✅ Pass consistently (no flakiness)
2. ✅ Complete within reasonable time (< 5 minutes for full suite)
3. ✅ Clean up test data
4. ✅ Validate invariants explicitly
5. ✅ Provide clear error messages on failure

## Continuous Integration

Tests should run:
- On every PR
- Before deployment
- Nightly (full suite)
- On-demand (manual trigger)

## Known Limitations

- Tests require live Supabase instance
- Tests require Stripe test mode
- Tests may be slow due to network calls
- Some tests may be flaky under high load (monitor)
