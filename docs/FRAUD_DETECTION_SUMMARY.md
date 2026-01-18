# Fraud Detection System - Implementation Summary

## What Was Built

A comprehensive fraud and abuse detection system with rate limiting, bot mitigation, risk scoring, and automated actions.

## Deliverables

### 1. Middleware / Edge Checks ✅

**Fraud Check Middleware** (`fraud-check` Edge Function)
- Checks purchase requests before allowing checkout
- Validates rate limits (user, card, IP)
- Checks user risk profile
- Checks card fingerprint risk
- Checks IP address risk
- Checks active risk actions
- Returns: allowed, requires_captcha, requires_phone_verification, blocked

**Record Scan Result** (`record-scan-result` Edge Function)
- Records scanner check-in results
- Updates device risk profiles
- Detects failed scan patterns
- Auto-blocks devices with critical failures

**Detect Fraud Patterns** (`detect-fraud-patterns` Edge Function)
- Runs fraud detection checks (cron job)
- Detects purchase spikes
- Detects transfer spam
- Detects high refund rates
- Detects failed scan patterns
- Creates risk signals
- Triggers automated actions

### 2. DB Fields for Risk Flags + Risk Scores ✅

**User Risk Profiles** (`user_risk_profiles`)
- `risk_score` (0-100)
- `risk_level` (low/medium/high/critical)
- `is_blocked`
- `requires_phone_verification`
- Rate limit counters

**Card Fingerprints** (`card_fingerprints`)
- `risk_score`
- `is_blocked`
- Rate limit counters
- Failed attempt tracking

**IP Addresses** (`ip_addresses`)
- `risk_score`
- `is_blocked`
- Rate limit counters
- Unique users count

**Device Risk Profiles** (`device_risk_profiles`)
- `risk_score`
- `is_blocked`
- Scan statistics
- Consecutive failures

**Risk Signals** (`risk_signals`)
- `signal_type` (10 types)
- `risk_level`
- `confidence_score`
- Resolution tracking

**Risk Actions** (`risk_actions`)
- `action_type` (7 types)
- `status` (pending/active/resolved/expired)
- Expiration dates

### 3. Admin "Risk Review" View Model and Queries ✅

**Admin Views:**
- `admin_high_risk_users` - High-risk users with details
- `admin_risk_signals_summary` - All risk signals
- `admin_active_risk_actions` - Active risk actions
- `admin_device_risk_summary` - Devices with failures
- `admin_rate_limit_violations` - Rate limit violations
- `admin_organizer_refund_rates` - Organizer refund rates

**Admin Functions:**
- `admin_block_user()` - Block user account
- `admin_require_phone_verification()` - Require phone verification
- `admin_freeze_transfers()` - Freeze transfers for event
- `admin_resolve_risk_signal()` - Resolve risk signal
- `admin_risk_dashboard_stats()` - Dashboard statistics

### 4. Automated Actions ✅

**Action Types:**
1. **throttle** - Reduce rate limits
2. **require_phone_verification** - Block until phone verified
3. **force_online_validation** - Require online QR validation
4. **freeze_transfers** - Prevent ticket transfers
5. **require_captcha** - Require captcha for purchases
6. **block_account** - Completely block user
7. **flag_for_review** - Flag for admin review

**Auto-Triggers:**
- Purchase spike → Require captcha
- Transfer spam (critical) → Freeze transfers
- Failed scans (critical) → Block device
- High refund rate → Create risk signal

## Files Created

### Migrations (3 files)
- `012_fraud_detection_system.sql` - Core fraud detection tables and functions
- `013_fraud_admin_views.sql` - Admin views and functions
- `014_add_high_demand_flag.sql` - High-demand event flag

### Edge Functions (3 functions)
- `fraud-check/index.ts` - Purchase fraud check middleware
- `record-scan-result/index.ts` - Scanner result recording
- `detect-fraud-patterns/index.ts` - Fraud pattern detection

### Documentation (2 files)
- `docs/FRAUD_DETECTION_SYSTEM.md` - Complete system documentation
- `docs/FRAUD_DETECTION_SUMMARY.md` - This file

## Key Features

### Rate Limiting
- ✅ Per-user limits (5/hour, 20/day, 50/week)
- ✅ Per-card limits (same)
- ✅ Per-IP limits (same)
- ✅ Stricter for high-demand events (2/hour, 10/day)
- ✅ Configurable per event

### Bot Mitigation
- ✅ Captcha toggle for high-demand events
- ✅ Captcha for high-risk users
- ✅ Captcha for multiple users from IP
- ✅ Phone verification requirement

### Detection Signals
- ✅ Repeated failed scans per device
- ✅ High refund rates per organizer
- ✅ Unusual purchase spikes
- ✅ Many transfers near event start
- ✅ Rate limit violations
- ✅ Card testing attempts
- ✅ Multiple accounts from same card/IP

### Automated Actions
- ✅ Throttle purchases
- ✅ Require phone verification
- ✅ Force online validation
- ✅ Freeze transfers
- ✅ Require captcha
- ✅ Block accounts
- ✅ Flag for review

## Usage Examples

### Check Purchase Before Checkout

```typescript
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
  throw new Error('Purchase blocked');
}

if (fraudCheck.requires_captcha) {
  // Show captcha
}
```

### Record Scan Result

```typescript
await fetch('/functions/v1/record-scan-result', {
  method: 'POST',
  body: JSON.stringify({
    device_id,
    ticket_id,
    result: 'valid',
    scanner_user_id,
  }),
});
```

### Run Fraud Detection (Cron)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/detect-fraud-patterns \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"check_types": ["purchase_spike", "transfer_spam"]}'
```

## Admin Queries

### View High-Risk Users

```sql
SELECT * FROM admin_high_risk_users
WHERE risk_level IN ('high', 'critical')
ORDER BY risk_score DESC;
```

### View Active Risk Signals

```sql
SELECT * FROM admin_risk_signals_summary
WHERE is_resolved = FALSE
ORDER BY created_at DESC;
```

### Block User

```sql
SELECT admin_block_user(
  'user-uuid',
  'Suspicious activity',
  'admin-uuid'
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
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

### Hourly Rate Limit Reset

```bash
0 * * * * psql -c "
  UPDATE user_risk_profiles SET purchases_last_hour = 0;
  UPDATE card_fingerprints SET purchases_last_hour = 0;
  UPDATE ip_addresses SET purchases_last_hour = 0;
"
```

## Risk Score Calculation

```
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

## Testing Checklist

- [ ] Rate limit exceeded blocks purchase
- [ ] High-risk user requires captcha
- [ ] Blocked user cannot purchase
- [ ] Failed scan pattern creates signal
- [ ] Purchase spike detected
- [ ] Transfer spam detected
- [ ] High refund rate detected
- [ ] Device auto-blocked after 10 failures
- [ ] Admin can block users
- [ ] Admin can resolve signals

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

3. **Integrate with Purchase Flow**
   - Add fraud check before checkout
   - Add captcha UI component
   - Add phone verification flow

4. **Set Up Cron Jobs**
   - Configure fraud detection runs
   - Set up rate limit resets

5. **Build Admin Dashboard**
   - Risk review interface
   - Action management UI
   - Dashboard stats display

## Security Considerations

- ✅ Fail closed (fraud check failures block purchases)
- ✅ Rate limits reset hourly (prevents permanent blocks)
- ✅ Admin override (can resolve false positives)
- ✅ Complete audit trail
- ✅ Privacy (card fingerprints hashed)

## Questions?

See `docs/FRAUD_DETECTION_SYSTEM.md` for complete documentation.
