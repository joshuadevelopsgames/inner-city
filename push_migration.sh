#!/bin/bash
# Push Supabase migrations

echo "📦 Pushing Inner City ticketing schema to Supabase..."

# Check if logged in
if ! supabase projects list &>/dev/null; then
  echo "❌ Not logged in to Supabase CLI"
  echo "Run: supabase login"
  exit 1
fi

# Check if linked
if ! supabase status &>/dev/null 2>&1; then
  echo "📎 Project not linked. You'll need to link it first."
  echo ""
  echo "To link your project:"
  echo "1. Get your project ref from: https://app.supabase.com"
  echo "2. Run: supabase link --project-ref YOUR_PROJECT_REF"
  echo ""
  read -p "Do you want to link now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter your project ref: " PROJECT_REF
    supabase link --project-ref "$PROJECT_REF"
  else
    exit 1
  fi
fi

# Push migrations
echo "🚀 Pushing migrations..."
supabase db push

echo "✅ Migration complete!"
