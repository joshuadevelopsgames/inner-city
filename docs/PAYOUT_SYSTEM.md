# Payout Safety System Documentation

## Overview

Escrow-like payout system that holds funds until event completion + delay, with trust tiers determining payout timing. Includes comprehensive ledger tracking and reconciliation.

## Architecture

```
Payment Success
    ↓
Create Payment Record
    ↓
Update Event Ledger
    ↓
Event Ends
    ↓
Calculate Payout Schedule (based on trust tier)
    ↓
Schedule Payout
    ↓
Hold Period (24h default, 0h for trusted)
    ↓
Process Payout (Stripe Transfer)
    ↓
Update Ledger
```

## Trust Tiers

### Tier Levels

1. **new** (default)
   - Hold: 48 hours after event end
   - Minimum payout: $100
   - Risk: High

2. **verified**
   - Hold: 12 hours after event end
   - Minimum payout: $100
   - Risk: Medium

3. **trusted**
   - Hold: 0 hours (immediate after event end)
   - Minimum payout: $50
   - Risk: Low

4. **premium**
   - Hold: 0 hours (immediate)
   - Minimum payout: $25
   - Risk: Very Low

### Trust Score Calculation

```sql
-- Factors:
-- - Events completed successfully
-- - Total revenue processed
-- - Chargeback rate
-- - Account age
-- - Verification status

trust_score = (
  events_completed * 10 +
  total_revenue_cents / 10000 +
  (chargeback_count = 0 ? 50 : -chargeback_count * 100)
)
```

## Database Schema

### Event Ledger

Tracks financial state per event:

- `gross_sales_cents` - Total revenue
- `platform_fees_cents` - Inner City fees (10%)
- `stripe_fees_cents` - Stripe processing fees (~2.9% + $0.30)
- `net_owed_cents` - Amount owed to organizer
- `payouts_sent_cents` - Already paid out
- `refunds_issued_cents` - Refunded amounts
- `refund_reserve_cents` - Held for potential refunds (10% for 30 days)
- `available_for_payout_cents` - Can be paid out now

### Payouts

Records of payout transactions:

- `amount_cents` - Payout amount
- `stripe_payout_id` - Stripe Transfer ID
- `status` - pending/scheduled/processing/completed/failed
- `scheduled_for` - When payout can execute
- `processed_at` - When actually processed

### Payout Schedules

Rules for when payouts can happen:

- `hold_until_event_end` - Wait for event to finish
- `hold_delay_hours` - Additional delay after event
- `min_payout_amount_cents` - Minimum payout threshold
- `trust_tier` - Override organizer's tier

### Ledger Entries

Audit trail of all financial transactions:

- `entry_type` - sale/refund/fee/payout/adjustment
- `amount_cents` - Transaction amount (negative for payouts)
- `payment_id` / `payout_id` - References
- `description` - Human-readable description

## API Endpoints

### Schedule Payout

**POST** `/functions/v1/schedule-payout`

```json
{
  "event_id": "uuid",
  "organizer_id": "uuid",
  "amount_cents": 50000  // Optional, defaults to available
}
```

**Response:**
```json
{
  "success": true,
  "payout_id": "uuid",
  "amount_cents": 50000,
  "scheduled_for": "2024-01-16T02:00:00Z",
  "status": "scheduled"
}
```

### Process Payouts

**POST** `/functions/v1/process-payouts`

Processes all scheduled payouts ready to execute.

**Body:**
```json
{
  "event_id": "uuid",  // Optional
  "organizer_id": "uuid",  // Optional
  "limit": 10
}
```

**Response:**
```json
{
  "processed": 5,
  "failed": 0,
  "errors": []
}
```

### Reconcile Events

**POST** `/functions/v1/reconcile-events`

Runs reconciliation to detect mismatches.

**Body:**
```json
{
  "event_id": "uuid",  // Optional, specific event
  "hours_ago": 24  // Events needing reconciliation
}
```

**Response:**
```json
{
  "reconciled": 10,
  "failed": 0,
  "errors": [],
  "discrepancies": [
    {
      "event_id": "uuid",
      "issues": [
        {
          "type": "ticket_payment_mismatch",
          "severity": "high",
          "message": "Tickets issued (100) does not match payments succeeded (98)"
        }
      ],
      "revenue_discrepancy_cents": 5000
    }
  ]
}
```

## Payout Flow

### 1. Payment Success

When a payment succeeds (via Stripe webhook):

```typescript
// Update ledger
await supabase.rpc('calculate_event_ledger', { p_event_id });

// Create ledger entry
await supabase.from('ledger_entries').insert({
  event_id,
  organizer_id,
  entry_type: 'sale',
  amount_cents: payment.amount_cents,
  fee_cents: payment.platform_fee_cents,
  payment_id: payment.id,
  description: `Ticket sale: ${ticket.id}`,
});
```

### 2. Event Ends

When event status changes to 'completed':

```typescript
// Calculate when payout can be scheduled
const availableAt = await supabase.rpc('calculate_payout_available_at', {
  p_event_id: event.id,
  p_organizer_id: organizer.id,
});

// Auto-schedule if above minimum
const ledger = await getLedger(event.id);
if (ledger.available_for_payout_cents >= minPayoutAmount) {
  await schedulePayout(event.id, organizer.id);
}
```

### 3. Payout Processing

Cron job or manual trigger:

```typescript
// Find ready payouts
const payouts = await getReadyPayouts();

for (const payout of payouts) {
  // Create Stripe Transfer
  const transfer = await stripe.transfers.create({
    amount: payout.amount_cents,
    currency: 'usd',
    destination: organizer.stripe_connect_account_id,
  });

  // Update payout
  await updatePayout(payout.id, {
    stripe_payout_id: transfer.id,
    status: 'completed',
  });

  // Update ledger
  await createLedgerEntry({
    entry_type: 'payout',
    amount_cents: -payout.amount_cents,
    payout_id: payout.id,
  });
}
```

## Refund Handling

### Full Refund

```typescript
// Refund payment
await stripe.refunds.create({
  payment_intent: payment.stripe_payment_intent_id,
});

// Update payment status
await updatePayment(payment.id, { status: 'refunded' });

// Update ledger
await supabase.rpc('calculate_event_ledger', { p_event_id });

// Create ledger entry
await createLedgerEntry({
  entry_type: 'refund',
  amount_cents: -payment.amount_cents,
  payment_id: payment.id,
});
```

### Partial Refund

```typescript
// Refund partial amount
await stripe.refunds.create({
  payment_intent: payment.stripe_payment_intent_id,
  amount: partialAmountCents,
});

// Create adjustment ledger entry
await createLedgerEntry({
  entry_type: 'refund',
  amount_cents: -partialAmountCents,
  payment_id: payment.id,
  description: `Partial refund: ${partialAmountCents} cents`,
});
```

## Reconciliation

### What It Checks

1. **Ticket-Payment Mismatch**
   - Tickets issued vs payments succeeded
   - Should match exactly

2. **Revenue Discrepancy**
   - Expected revenue (tickets * price) vs actual revenue (payments)
   - Tolerance: $1

3. **Tickets Without Payments**
   - Tickets with status != 'refunded' but no succeeded payment
   - Indicates data integrity issue

4. **Payments Without Tickets**
   - Succeeded payments with no ticket issued
   - Critical issue

5. **Duplicate Payment Intents**
   - Same payment intent used for multiple payments
   - Indicates duplicate processing

### Running Reconciliation

```bash
# Via Edge Function
curl -X POST https://your-project.supabase.co/functions/v1/reconcile-events \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hours_ago": 24}'

# Via SQL
SELECT * FROM reconcile_event('event-uuid');
```

## Trust Tier Rules Engine

### Upgrading Trust Tier

```sql
-- Check if organizer qualifies for upgrade
SELECT
  id,
  trust_tier,
  trust_score,
  events_completed,
  total_revenue_cents,
  chargeback_count
FROM organizers
WHERE id = 'organizer-uuid';

-- Upgrade logic:
-- - new → verified: 5+ events, $10k+ revenue, 0 chargebacks
-- - verified → trusted: 20+ events, $100k+ revenue, <1% chargeback rate
-- - trusted → premium: 50+ events, $500k+ revenue, <0.5% chargeback rate
```

### Payout Timing Rules

```typescript
function getPayoutDelay(trustTier: TrustTier): number {
  switch (trustTier) {
    case 'premium':
    case 'trusted':
      return 0; // Immediate
    case 'verified':
      return 12; // 12 hours
    case 'new':
    default:
      return 48; // 48 hours
  }
}
```

## Cron Jobs

### Daily Payout Processing

```bash
# Run every hour
0 * * * * curl -X POST https://your-project.supabase.co/functions/v1/process-payouts \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

### Daily Reconciliation

```bash
# Run daily at 2 AM
0 2 * * * curl -X POST https://your-project.supabase.co/functions/v1/reconcile-events \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hours_ago": 24}'
```

### Ledger Recalculation

```bash
# Run every 6 hours
0 */6 * * * psql -c "SELECT calculate_event_ledger(event_id) FROM events WHERE status = 'completed'"
```

## Security Considerations

1. **Service Role Only**: Payout processing requires service role key
2. **Ledger Immutability**: Ledger entries are append-only
3. **Audit Trail**: All financial transactions logged
4. **Reconciliation**: Automated checks for discrepancies
5. **Refund Reserves**: Hold 10% for 30 days after event

## Testing

### Test Scenarios

1. **Trusted Organizer Payout**
   - Event ends → Immediate payout scheduled
   - Payout processes immediately

2. **New Organizer Payout**
   - Event ends → 48h delay
   - Payout scheduled for event_end + 48h

3. **Refund Before Payout**
   - Refund issued → Ledger updated
   - Available payout reduced

4. **Reconciliation Mismatch**
   - Create ticket without payment
   - Run reconciliation → Detects issue

5. **Partial Refund**
   - Refund 50% → Ledger updated correctly
   - Remaining 50% still available for payout

## Monitoring

### Key Metrics

- Payout success rate
- Average payout delay
- Reconciliation discrepancies
- Refund rate
- Chargeback rate

### Alerts

- High discrepancy rate (>1%)
- Failed payouts
- Reconciliation failures
- Unusual refund patterns
