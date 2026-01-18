# Stripe Setup Instructions

## ✅ Completed

- ✅ Stripe Secret Key set in Supabase secrets
- ✅ Stripe Webhook Secret set in Supabase secrets

## ⚠️ Next Steps

### 1. Get Webhook Secret

After configuring the webhook endpoint in Stripe Dashboard, you'll receive a webhook signing secret.

**To set it:**
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2. Configure Stripe Webhook

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"https://gdsblffnkiswaweqokcm.supabase.co/functions/v1/stripe-webhook
3. Endpoint URL: ``
4. Select events to listen to:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created` (optional, for fraud detection)
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)
7. Set it: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

### 3. Test Webhook

You can test the webhook using Stripe CLI:
```bash
stripe listen --forward-to https://gdsblffnkiswaweqokcm.supabase.co/functions/v1/stripe-webhook
```

## 🔒 Security Notes

- ✅ Secret key is stored securely in Supabase secrets
- ✅ Never commit secrets to git
- ✅ Use test keys for development, production keys for production
- ✅ Rotate keys if compromised

## 📝 Stripe Keys Reference

**Publishable Key** (for frontend):
```
pk_test_... (Get from Stripe Dashboard → Developers → API keys)
```

**Secret Key** (set in Supabase):
```
sk_test_... (Get from Stripe Dashboard → Developers → API keys)
⚠️ Never commit this to git - store in Supabase secrets only
```

**Webhook Secret** (configured):
```
whsec_... (Get from Stripe Dashboard → Webhooks → Endpoint → Signing secret)
⚠️ Never commit this to git - store in Supabase secrets only
```
