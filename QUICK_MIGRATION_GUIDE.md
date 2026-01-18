# Quick Migration Guide

## ✅ What's Already Done

- ✅ 10 Edge Functions deployed
- ✅ Stripe Secret Key configured
- ✅ Project linked

## 🚀 Apply Migrations (5 minutes)

### Step 1: Open SQL Editor

Go to: **https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new**

### Step 2: Apply Each Migration

Copy and paste each migration file content, then click "Run":

1. **003_reservation_system.sql** - Reservation tables and atomic functions
2. **004_webhook_idempotency.sql** - Webhook event tracking
3. **006_qr_token_system.sql** - QR token validation
4. **007_atomic_check_in.sql** - Atomic check-in functions
5. **008_payout_system.sql** - Payout ledger and schedules
6. **009_reconciliation_system.sql** - Reconciliation tables
7. **010_trust_tier_upgrade.sql** - Trust tier logic
8. **012_fraud_detection_system.sql** - Fraud detection tables
9. **013_fraud_admin_views.sql** - Admin views
10. **014_add_high_demand_flag.sql** - High-demand event flag

### Step 3: Verify

After applying all migrations, verify with:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'reservations', 
    'event_ledger', 
    'payouts', 
    'risk_signals',
    'user_risk_profiles'
  );
```

## 📝 Migration Files Location

All migration files are in: `supabase/migrations/`

## ⚡ Quick Copy Commands

```bash
# View migration file
cat supabase/migrations/003_reservation_system.sql

# Copy to clipboard (macOS)
cat supabase/migrations/003_reservation_system.sql | pbcopy

# Then paste in SQL Editor and run
```

## 🎯 After Migrations

1. **Configure Stripe Webhook** (see STRIPE_SETUP.md)
2. **Set Webhook Secret**: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
3. **Run Tests** (optional): `deno test --allow-net --allow-env tests/`

## ✅ Done!

Once migrations are applied, your system will be fully operational!
