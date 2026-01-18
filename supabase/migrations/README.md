# Inner City Ticketing Database Schema

## Overview

This schema implements a comprehensive ticketing system for Inner City with support for:
- Multi-city, multi-organizer events
- Atomic inventory management (prevents overselling)
- Ticket transfers and resale
- Comprehensive scanning/check-in system
- Fraud detection capabilities
- Event moderation and reporting

## Schema Files

1. **001_ticketing_schema.sql** - Main schema with tables, constraints, indexes, RLS policies
2. **002_example_queries.sql** - Example queries for common operations and analytics

## Key Design Decisions

### Inventory Management

- **Atomic Operations**: `ticket_inventory` table uses CHECK constraints to prevent negative inventory
- **Reserved vs Sold**: Separate tracking for reserved (during payment) vs sold (confirmed) tickets
- **Generated Column**: `available_count` is computed automatically for performance

### Ticket Security

- **QR Secrets**: Each ticket has a unique `qr_secret` for cryptographic QR generation
- **Rotation Nonces**: `qr_rotation_nonce` increments for time-based QR rotation (prevents screenshot reuse)
- **Status Tracking**: Comprehensive status enum (active, used, refunded, transferred, revoked, expired)

### Scanning System

- **Immutable Logs**: `check_in_logs` table is append-only (no updates/deletes) for audit trail
- **Device Tracking**: `scanner_device_id` enables fraud detection (multiple failed scans per device)
- **Result Types**: Detailed scan results (valid, invalid, already_used, expired, revoked)

### Moderation

- **Event Status**: Events can be draft, active, under_review, removed, cancelled, completed
- **Status History**: `event_status_history` tracks all status changes with timestamps and reasons
- **Reporting**: `event_reports` table for user-reported issues

## Row Level Security (RLS)

### Public Access
- Cities (read-only)
- Active events (read-only)
- Check-in logs (read-only for transparency)

### User Access
- Users can view/manage own tickets
- Users can view own payments
- Users can create and view own reports
- Users can manage own scanner devices

### Organizer Access
- Organizers can manage own events
- Organizers can view tickets/payments for own events
- Organizers can update own profile

### Admin Access
- Admins (via service role) can manage all tables
- Admins can review and resolve reports
- Admins can change event statuses

## Usage

### Running Migrations

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase SQL Editor
# Copy and paste the contents of 001_ticketing_schema.sql
```

### Example: Create an Event

```sql
-- 1. Ensure organizer exists
INSERT INTO organizers (id, display_name, tier)
VALUES (auth.uid(), 'My Organizer Name', 'community')
ON CONFLICT (id) DO NOTHING;

-- 2. Create event
INSERT INTO events (organizer_id, city_id, title, start_at, end_at, venue_name, tier)
VALUES (
  auth.uid(),
  'city-uuid-here',
  'Underground Techno Night',
  '2024-02-15 22:00:00+00',
  '2024-02-16 04:00:00+00',
  'Warehouse 7',
  'community'
)
RETURNING id;

-- 3. Initialize inventory
INSERT INTO ticket_inventory (event_id, total_capacity)
VALUES ('event-uuid-here', 200);

-- 4. Create ticket type (GA for MVP)
INSERT INTO ticket_types (event_id, type, name, price_cents, capacity)
VALUES ('event-uuid-here', 'ga', 'General Admission', 2500, 200);
```

### Example: Purchase Ticket

```sql
-- This would typically be done via Edge Function with Stripe integration
-- But the SQL would be:

BEGIN;

-- 1. Reserve inventory (atomic)
UPDATE ticket_inventory
SET reserved_count = reserved_count + 1
WHERE event_id = 'event-uuid'
  AND (sold_count + reserved_count) < total_capacity
RETURNING *;

-- 2. Create ticket (after Stripe payment succeeds)
INSERT INTO tickets (event_id, ticket_type_id, buyer_id, qr_secret, purchase_price_cents, stripe_payment_intent_id)
VALUES (
  'event-uuid',
  'ticket-type-uuid',
  auth.uid(),
  gen_random_uuid()::text,
  2500,
  'pi_xxx'
)
RETURNING id;

-- 3. Create payment record
INSERT INTO payments (ticket_id, event_id, buyer_id, organizer_id, amount_cents, platform_fee_cents, organizer_payout_cents, stripe_payment_intent_id, stripe_connect_account_id, status)
VALUES (
  'ticket-uuid',
  'event-uuid',
  auth.uid(),
  'organizer-uuid',
  2500,
  250, -- 10% platform fee
  2250, -- Organizer payout
  'pi_xxx',
  'acct_xxx',
  'succeeded'
);

-- 4. Update inventory (move from reserved to sold)
UPDATE ticket_inventory
SET reserved_count = reserved_count - 1,
    sold_count = sold_count + 1
WHERE event_id = 'event-uuid';

COMMIT;
```

### Example: Check-In Ticket

```sql
-- This would be done via Edge Function
-- The SQL would be:

BEGIN;

-- 1. Check ticket status
SELECT id, status, qr_secret, qr_rotation_nonce, expires_at
FROM tickets
WHERE qr_secret = 'scanned-qr-secret'
FOR UPDATE;

-- 2. If valid, update ticket status
UPDATE tickets
SET status = 'used'
WHERE id = 'ticket-uuid'
  AND status = 'active';

-- 3. Log check-in (immutable)
INSERT INTO check_in_logs (
  ticket_id,
  event_id,
  scanner_user_id,
  scanner_device_id,
  qr_secret,
  qr_nonce,
  result,
  location_lat,
  location_lng
)
VALUES (
  'ticket-uuid',
  'event-uuid',
  auth.uid(), -- Staff scanner
  'device-id-here',
  'scanned-qr-secret',
  123, -- Current nonce
  'valid',
  49.2827,
  -123.1207
);

COMMIT;
```

## Indexes

All foreign keys and commonly queried columns are indexed for performance:
- Event lookups by city, organizer, status, date
- Ticket lookups by buyer, event, status, QR secret
- Check-in logs by event, scanner, device, timestamp
- Payment lookups by Stripe payment intent ID

## Constraints

### Data Integrity
- Inventory cannot go negative (CHECK constraint)
- Ticket status transitions are validated
- Payment amounts must reconcile (platform_fee + organizer_payout = total)
- Transfer from/to users must be different

### Business Rules
- Events must have end_at > start_at
- Tickets expire after event ends
- Only official organizers can have Stripe Connect accounts
- Revoked tickets must have revocation reason

## Triggers

1. **update_updated_at_column**: Automatically updates `updated_at` timestamps
2. **track_event_status_change**: Logs all event status changes to history table
3. **update_inventory_on_ticket_status**: Updates inventory when tickets are used/refunded

## Helper Functions

- `get_remaining_inventory(event_uuid)`: Returns inventory stats for an event
- `is_organizer(user_uuid)`: Checks if user is an organizer
- `is_event_organizer(user_uuid, event_uuid)`: Checks if user organizes specific event

## Security Considerations

1. **QR Secrets**: Never expose raw `qr_secret` to clients - use HMAC tokens
2. **RLS Policies**: All tables have RLS enabled - test policies thoroughly
3. **Service Role**: Use service role for ticket creation/check-in (bypasses RLS)
4. **Audit Trail**: All critical operations logged (check-ins, transfers, status changes)

## Future Enhancements

- **Seated Tickets**: Add `seat_number`, `row`, `section` columns to tickets
- **Multi-Currency**: Add `currency` column to payments
- **Refund Tracking**: Separate refunds table for better analytics
- **Loyalty Points**: Add points system for frequent attendees
- **Waitlist**: Add waitlist table for sold-out events

## Testing

Run these queries to verify schema:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';

-- Check indexes
SELECT indexname, tablename FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```
