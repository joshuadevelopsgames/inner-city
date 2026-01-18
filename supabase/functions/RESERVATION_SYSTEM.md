# Reservation System Documentation

## Overview

The reservation system provides atomic inventory management to prevent overselling even under high concurrency. It uses a three-phase approach:

1. **Reserve** - Hold inventory for a limited time (default: 10 minutes)
2. **Checkout** - Create Stripe Checkout Session tied to reservation
3. **Consume** - On payment success, issue tickets and mark reservation as consumed

## Architecture

### Database Functions

All inventory operations use PostgreSQL functions with `SELECT FOR UPDATE` to ensure atomicity:

- `create_reservation()` - Atomically reserves inventory
- `consume_reservation()` - Marks reservation as used after payment
- `release_reservation()` - Releases expired/cancelled reservations
- `cleanup_expired_reservations()` - Batch cleanup of expired reservations

### Edge Functions

1. **create-reservation** - Creates a reservation and holds inventory
2. **create-checkout** - Creates Stripe Checkout Session for reservation
3. **stripe-webhook** - Handles payment webhooks and issues tickets

## Flow Diagram

```
User clicks "Buy Tickets"
    ↓
POST /create-reservation
    ↓
Reservation created (inventory reserved)
    ↓
POST /create-checkout
    ↓
Stripe Checkout Session created
    ↓
User completes payment
    ↓
Stripe webhook: checkout.session.completed
    ↓
Reservation consumed → Tickets issued
```

## API Endpoints

### POST /functions/v1/create-reservation

Creates a reservation and holds inventory atomically.

**Request:**
```json
{
  "event_id": "uuid",
  "ticket_type_id": "uuid", // optional
  "quantity": 2,
  "expires_in_minutes": 10 // optional, default: 10
}
```

**Response (201):**
```json
{
  "reservation_id": "uuid",
  "expires_at": "2024-01-15T20:30:00Z",
  "quantity": 2
}
```

**Response (409):**
```json
{
  "error": "Insufficient inventory available"
}
```

### POST /functions/v1/create-checkout

Creates Stripe Checkout Session for a reservation.

**Request:**
```json
{
  "reservation_id": "uuid",
  "success_url": "https://yourapp.com/success",
  "cancel_url": "https://yourapp.com/cancel"
}
```

**Response (200):**
```json
{
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_xxx",
  "expires_at": "2024-01-15T20:30:00Z"
}
```

## Stripe Webhook Handler

### Events Handled

1. **checkout.session.completed**
   - Consumes reservation
   - Issues tickets
   - Creates payment records
   - Updates inventory (reserved → sold)

2. **checkout.session.expired**
   - Releases reservation
   - Returns inventory to available

3. **payment_intent.succeeded** (backup)
   - Fallback if checkout.session.completed wasn't received

### Idempotency

Webhook handler uses `webhook_events` table to track processed Stripe events by `event.id`. Duplicate events are ignored.

**Webhook Setup:**

1. In Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET` environment variable

## Concurrency Safety

### How It Works

1. **Row-Level Locking**: `SELECT FOR UPDATE` locks inventory row during reservation
2. **Atomic Operations**: All inventory updates happen in single transaction
3. **CHECK Constraints**: Database enforces `sold_count + reserved_count <= total_capacity`
4. **SKIP LOCKED**: Cleanup function uses `FOR UPDATE SKIP LOCKED` to avoid deadlocks

### Example Race Condition

```
Time    User A                    User B                    Inventory
─────────────────────────────────────────────────────────────────────
T0      SELECT FOR UPDATE         (waiting)                 5 available
T1      Check: 5 >= 1 ✓          (waiting)                 5 available
T2      Reserve 1                 (waiting)                 4 available, 1 reserved
T3      COMMIT                    SELECT FOR UPDATE         4 available, 1 reserved
T4      (done)                    Check: 4 >= 1 ✓          4 available, 1 reserved
T5      (done)                    Reserve 1                 3 available, 2 reserved
T6      (done)                    COMMIT                   3 available, 2 reserved
```

Both users succeed because there's enough inventory. If only 1 ticket was left, User B would get `NULL` (insufficient inventory).

## Testing

### Run Concurrency Tests

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# Run tests
deno test --allow-net --allow-env tests/reservation-concurrency.test.ts
```

### Manual Testing

1. **Test Reservation:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-reservation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "your-event-id",
    "quantity": 2
  }'
```

2. **Test Checkout:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "reservation-id-from-step-1",
    "success_url": "https://yourapp.com/success",
    "cancel_url": "https://yourapp.com/cancel"
  }'
```

3. **Complete payment in Stripe Checkout**
4. **Verify tickets issued** (check `tickets` table)

## Monitoring

### Key Metrics

```sql
-- Active reservations
SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND expires_at > NOW();

-- Expired reservations (should be cleaned up)
SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND expires_at < NOW();

-- Reservation success rate
SELECT 
  COUNT(*) FILTER (WHERE status = 'consumed') AS successful,
  COUNT(*) FILTER (WHERE status = 'expired') AS expired,
  COUNT(*) AS total
FROM reservations
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Average time to consume
SELECT 
  AVG(EXTRACT(EPOCH FROM (consumed_at - created_at))) AS avg_seconds
FROM reservations
WHERE status = 'consumed'
  AND consumed_at >= NOW() - INTERVAL '24 hours';
```

### Cleanup Job

Set up a cron job (via Supabase Cron or external scheduler) to run:

```sql
SELECT cleanup_expired_reservations();
```

Recommended frequency: Every 5 minutes

## Error Handling

### Common Errors

1. **Insufficient Inventory (409)**
   - User tried to reserve more than available
   - Frontend should show "Sold out" or "Only X tickets left"

2. **Reservation Expired (410)**
   - User took too long to complete checkout
   - Frontend should create new reservation

3. **Reservation Already Consumed**
   - Webhook was called twice (idempotency prevents duplicate tickets)
   - Safe to ignore

4. **Event Not Active**
   - Event status changed to cancelled/removed
   - Frontend should refresh event status

## Frontend Integration

### Example React Hook

```typescript
async function purchaseTickets(eventId: string, quantity: number) {
  // Step 1: Create reservation
  const { data: reservation, error: resError } = await supabase.functions.invoke(
    'create-reservation',
    {
      body: { event_id: eventId, quantity },
    }
  );

  if (resError || !reservation?.reservation_id) {
    throw new Error('Failed to reserve tickets');
  }

  // Step 2: Create checkout
  const { data: checkout, error: checkoutError } = await supabase.functions.invoke(
    'create-checkout',
    {
      body: {
        reservation_id: reservation.reservation_id,
        success_url: `${window.location.origin}/success`,
        cancel_url: `${window.location.origin}/cancel`,
      },
    }
  );

  if (checkoutError || !checkout?.checkout_url) {
    // Release reservation on error
    await supabase.rpc('release_reservation', {
      p_reservation_id: reservation.reservation_id,
    });
    throw new Error('Failed to create checkout');
  }

  // Step 3: Redirect to Stripe Checkout
  window.location.href = checkout.checkout_url;
}
```

## Security Considerations

1. **RLS Policies**: Reservations are user-scoped (users can only see own)
2. **Service Role**: Edge Functions use service role to bypass RLS for operations
3. **Webhook Verification**: Stripe signature verified before processing
4. **Idempotency**: Webhook events tracked to prevent duplicate processing
5. **Expiration**: Reservations auto-expire to prevent inventory lockup

## Troubleshooting

### Issue: Reservations not expiring

**Solution:** Ensure cleanup job is running:
```sql
SELECT cleanup_expired_reservations();
```

### Issue: Inventory shows negative

**Impossible** - CHECK constraint prevents this. If you see this, there's a bug in the application logic.

### Issue: Webhook not receiving events

**Check:**
1. Webhook endpoint URL is correct
2. Webhook secret matches `STRIPE_WEBHOOK_SECRET`
3. Events are selected in Stripe Dashboard
4. Check Supabase Edge Function logs

### Issue: Tickets not issued after payment

**Check:**
1. Webhook was received (check `webhook_events` table)
2. Reservation status (should be 'consumed')
3. Check Edge Function logs for errors
4. Verify Stripe payment_intent exists
