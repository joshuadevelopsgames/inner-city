# Fraud and Abuse Detection System

## Overview

Comprehensive fraud detection system with rate limiting, bot mitigation, and automated risk actions for underground events.

## Architecture

```
Purchase Request
    ↓
Fraud Check Middleware
    ↓
[Rate Limits] → [User Risk] → [Card Risk] → [IP Risk] → [Risk Actions]
    ↓
Decision: Allow / Require Captcha / Block
    ↓
Record Purchase Attempt
    ↓
Detect Patterns (Cron)
    ↓
Create Risk Signals
    ↓
Auto Actions / Admin Review
```

## Components

### 1. Rate Limiting

**Per-Entity Limits:**
- **User**: 5/hour, 20/day, 50/week (default)
- **Card Fingerprint**: 5/hour, 20/day, 50/week
- **IP Address**: 5/hour, 20/day, 50/week
- **High-Demand Events**: 2/hour, 10/day (stricter)

**Configuration:**
- Stored in `rate_limit_configs` table
- Can be overridden per event
- Automatically stricter for high-demand events

### 2. Risk Signals

**Detection Types:**

1. **rate_limit_exceeded**
   - Triggered when purchase exceeds rate limits
   - Risk level: Medium

2. **failed_scan_repeated**
   - Device has >50% failure rate or >5 consecutive failures
   - Risk level: Medium/High/Critical

3. **high_refund_rate**
   - Organizer has >25% refund rate
   - Risk level: High/Critical

4. **purchase_spike**
   - >50 purchases/hour or >3x average
   - Risk level: Medium/High/Critical

5. **transfer_spam**
   - >20 transfers in 24h before event start
   - Risk level: Medium/High/Critical

6. **bot_activity**
   - Multiple users from same IP
   - Suspicious user agent patterns
   - Risk level: Medium/High

7. **chargeback**
   - Payment disputed
   - Risk level: High

8. **suspicious_device**
   - Device with high failure rate
   - Risk level: Medium/High

9. **multiple_accounts**
   - Same card used by multiple users
   - Risk level: Medium

10. **card_testing**
    - Multiple failed attempts with same card
    - Risk level: High

### 3. Automated Actions

**Action Types:**

1. **throttle**
   - Reduce rate limits for user/card/IP
   - Duration: Configurable

2. **require_phone_verification**
   - Block purchases until phone verified
   - Duration: Until verified

3. **force_online_validation**
   - Require online QR validation (no offline)
   - Duration: Configurable

4. **freeze_transfers**
   - Prevent ticket transfers for event
   - Duration: Configurable

5. **require_captcha**
   - Require captcha for purchases
   - Duration: Configurable

6. **block_account**
   - Completely block user
   - Duration: Until manually unblocked

7. **flag_for_review**
   - Flag for admin review
   - Duration: Until resolved

## Database Schema

### Risk Tracking Tables

**user_risk_profiles**
- Risk score (0-100)
- Risk level (low/medium/high/critical)
- Rate limit counters
- Block status
- Phone verification status

**card_fingerprints**
- Card hash tracking
- Rate limit counters
- Block status
- Failed attempt tracking

**ip_addresses**
- IP address tracking
- Rate limit counters
- Block status
- Unique users count

**device_risk_profiles**
- Scanner device tracking
- Scan statistics
- Failure rate
- Consecutive failures

**risk_signals**
- Detected fraud indicators
- Confidence scores
- Resolution tracking

**risk_actions**
- Automated responses
- Status tracking
- Expiration dates

## API Endpoints

### Fraud Check

**POST** `/functions/v1/fraud-check`

Check purchase request for fraud indicators.

**Body:**
```json
{
  "user_id": "uuid",
  "event_id": "uuid",
  "card_fingerprint": "sha256-hash",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0..."
}
```

**Response:**
```json
{
  "allowed": true,
  "requires_captcha": false,
  "requires_phone_verification": false,
  "blocked": false,
  "reasons": [],
  "risk_score": 25
}
```

### Record Scan Result

**POST** `/functions/v1/record-scan-result`

Record scanner check-in results.

**Body:**
```json
{
  "device_id": "device-123",
  "ticket_id": "uuid",
  "result": "valid",
  "scanner_user_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "device_id": "device-123",
  "risk_score": 0,
  "is_blocked": false,
  "consecutive_failures": 0
}
```

### Detect Fraud Patterns

**POST** `/functions/v1/detect-fraud-patterns`

Run fraud detection checks (cron job).

**Body:**
```json
{
  "event_id": "uuid",  // Optional
  "check_types": ["purchase_spike", "transfer_spam"]  // Optional
}
```

**Response:**
```json
{
  "signals_created": 3,
  "actions_taken": 1,
  "errors": []
}
```

## Integration Points

### Purchase Flow

```typescript
// Before creating checkout session
const fraudCheck = await fetch('/functions/v1/fraud-check', {
  method: 'POST',
  body: JSON.stringify({
    user_id,
    event_id,
    card_fingerprint: hashCard(card),
    ip_address: req.ip,
  }),
});

if (!fraudCheck.allowed) {
  throw new Error('Purchase blocked: ' + fraudCheck.reasons.join(', '));
}

if (fraudCheck.requires_captcha) {
  // Show captcha
}

if (fraudCheck.requires_phone_verification) {
  // Require phone verification
}

// Record purchase attempt
await recordPurchaseAttempt(user_id, cardFingerprint, ipAddress, success);
```

### Scanner Flow

```typescript
// After scan result
await fetch('/functions/v1/record-scan-result', {
  method: 'POST',
  body: JSON.stringify({
    device_id,
    ticket_id,
    result: 'valid' | 'invalid' | 'already_used',
    scanner_user_id,
  }),
});
```

## Admin Views

### High-Risk Users

```sql
SELECT * FROM admin_high_risk_users
WHERE risk_level IN ('high', 'critical')
ORDER BY risk_score DESC;
```

### Risk Signals Summary

```sql
SELECT * FROM admin_risk_signals_summary
WHERE is_resolved = FALSE
ORDER BY created_at DESC;
```

### Active Risk Actions

```sql
SELECT * FROM admin_active_risk_actions
WHERE status IN ('pending', 'active')
ORDER BY created_at DESC;
```

### Device Risk Summary

```sql
SELECT * FROM admin_device_risk_summary
WHERE consecutive_failures >= 5
ORDER BY consecutive_failures DESC;
```

### Rate Limit Violations

```sql
SELECT * FROM admin_rate_limit_violations
ORDER BY violation_amount DESC;
```

### Organizer Refund Rates

```sql
SELECT * FROM admin_organizer_refund_rates
WHERE refund_rate_percent > 25
ORDER BY refund_rate_percent DESC;
```

## Admin Actions

### Block User

```sql
SELECT admin_block_user(
  'user-uuid',
  'Suspicious activity detected',
  'admin-user-uuid'
);
```

### Require Phone Verification

```sql
SELECT admin_require_phone_verification(
  'user-uuid',
  'High risk score',
  'admin-user-uuid'
);
```

### Freeze Transfers

```sql
SELECT admin_freeze_transfers(
  'event-uuid',
  'Transfer spam detected',
  'admin-user-uuid'
);
```

### Resolve Risk Signal

```sql
SELECT admin_resolve_risk_signal(
  'signal-uuid',
  'False positive - verified user',
  'admin-user-uuid'
);
```

### Dashboard Stats

```sql
SELECT * FROM admin_risk_dashboard_stats();
```

## Cron Jobs

### Hourly Fraud Detection

```bash
0 * * * * curl -X POST https://your-project.supabase.co/functions/v1/detect-fraud-patterns \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"check_types": ["purchase_spike", "transfer_spam"]}'
```

### Daily Risk Score Updates

```bash
0 2 * * * psql -c "UPDATE user_risk_profiles SET risk_score = calculate_user_risk_score(user_id)"
```

### Rate Limit Reset (Hourly)

```bash
0 * * * * psql -c "
  UPDATE user_risk_profiles SET purchases_last_hour = 0;
  UPDATE card_fingerprints SET purchases_last_hour = 0;
  UPDATE ip_addresses SET purchases_last_hour = 0;
"
```

## Risk Score Calculation

```sql
risk_score = 
  + (purchases_last_hour > 10 ? 20 : 0)
  + (purchases_last_day > 30 ? 15 : 0)
  + (refund_rate > 50% ? 30 : refund_rate > 25% ? 15 : 0)
  + (recent_signals * 10)
```

**Risk Levels:**
- **Low**: 0-39
- **Medium**: 40-59
- **High**: 60-79
- **Critical**: 80-100

## Bot Mitigation

### Captcha Requirements

1. **High-demand events**: Always required
2. **High-risk users**: Required (risk_score >= 60)
3. **Multiple users from IP**: Required (>10 users)
4. **Purchase spike**: Auto-required

### Phone Verification

1. **High-risk users**: Required
2. **Admin action**: Can require manually
3. **Multiple accounts**: Auto-required

## Testing

### Test Scenarios

1. **Rate Limit Exceeded**
   - Make 6 purchases in 1 hour
   - Should block 6th purchase

2. **Failed Scan Pattern**
   - Device fails 6 consecutive scans
   - Should create risk signal
   - Should auto-block device if critical

3. **Purchase Spike**
   - 60 purchases in 1 hour
   - Should create risk signal
   - Should require captcha

4. **Transfer Spam**
   - 25 transfers before event start
   - Should create risk signal
   - Should freeze transfers if critical

5. **High Refund Rate**
   - Organizer with 30% refund rate
   - Should create risk signal

## Monitoring

### Key Metrics

- Fraud check pass rate
- Risk signal creation rate
- Automated action rate
- False positive rate
- Blocked purchase rate

### Alerts

- Critical risk signals
- High refund rate organizers
- Rate limit violations spike
- Device failures spike

## Security Considerations

1. **Fail Closed**: Fraud check failures block purchases
2. **Rate Limit Reset**: Hourly reset prevents permanent blocks
3. **Admin Override**: Admins can resolve false positives
4. **Audit Trail**: All actions logged
5. **Privacy**: Card fingerprints are hashed

## Next Steps

1. **Deploy Migrations**
   ```bash
   supabase db push
   ```

2. **Deploy Edge Functions**
   ```bash
   supabase functions deploy fraud-check
   supabase functions deploy record-scan-result
   supabase functions deploy detect-fraud-patterns
   ```

3. **Set Up Cron Jobs**
   - Configure fraud detection runs
   - Set up rate limit resets

4. **Integrate with Purchase Flow**
   - Add fraud check before checkout
   - Add captcha UI
   - Add phone verification flow

5. **Build Admin Dashboard**
   - Risk review interface
   - Action management UI
   - Dashboard stats display
