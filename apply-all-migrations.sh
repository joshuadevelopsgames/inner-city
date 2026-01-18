#!/bin/bash
# Apply all migrations by copying to clipboard one by one
# Usage: ./apply-all-migrations.sh

set -e

PROJECT_REF="gdsblffnkiswaweqokcm"
SQL_EDITOR_URL="https://app.supabase.com/project/${PROJECT_REF}/sql/new"

MIGRATIONS=(
  "003_reservation_system.sql"
  "004_webhook_idempotency.sql"
  "006_qr_token_system.sql"
  "007_atomic_check_in.sql"
  "008_payout_system.sql"
  "009_reconciliation_system.sql"
  "010_trust_tier_upgrade.sql"
  "012_fraud_detection_system.sql"
  "013_fraud_admin_views.sql"
  "014_add_high_demand_flag.sql"
)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        MIGRATION APPLICATION HELPER                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will copy each migration to your clipboard."
echo "You'll paste and run each one in the SQL Editor."
echo ""
echo "SQL Editor: ${SQL_EDITOR_URL}"
echo ""
echo "Press Enter to start, or Ctrl+C to cancel..."
read

for i in "${!MIGRATIONS[@]}"; do
  migration="${MIGRATIONS[$i]}"
  file="supabase/migrations/${migration}"
  
  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    continue
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Migration $((i+1))/${#MIGRATIONS[@]}: ${migration}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Copy to clipboard
  cat "$file" | pbcopy
  
  echo "✅ Migration copied to clipboard!"
  echo ""
  echo "📋 Next steps:"
  echo "   1. Open SQL Editor: ${SQL_EDITOR_URL}"
  echo "   2. Paste (Cmd+V) the migration"
  echo "   3. Click 'Run'"
  echo "   4. Wait for success message"
  echo ""
  echo "Press Enter after you've applied this migration..."
  read
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ ALL MIGRATIONS APPLIED                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Configure Stripe webhook (see STRIPE_SETUP.md)"
echo "  2. Set webhook secret: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_..."
echo "  3. Run tests: deno test --allow-net --allow-env tests/"
echo ""
