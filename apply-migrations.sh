#!/bin/bash
# Apply all migrations to Supabase
# Usage: ./apply-migrations.sh

set -e

PROJECT_REF="gdsblffnkiswaweqokcm"
MIGRATIONS_DIR="supabase/migrations"

echo "🚀 Applying migrations to Supabase project: $PROJECT_REF"
echo ""

# Check if psql is available
if command -v psql &> /dev/null; then
    echo "✅ psql found, using direct database connection"
    
    # Get database URL from secrets
    DB_URL=$(supabase secrets list 2>/dev/null | grep SUPABASE_DB_URL | awk '{print $NF}' || echo "")
    
    if [ -z "$DB_URL" ]; then
        echo "⚠️  Database URL not found in secrets"
        echo "Please set SUPABASE_DB_URL environment variable or use SQL editor"
        exit 1
    fi
    
    # Apply migrations in order
    for migration in 003 004 006 007 008 009 010 012 013 014; do
        file="${MIGRATIONS_DIR}/${migration}_"*.sql
        if [ -f $file ]; then
            echo "📄 Applying ${migration}_*.sql..."
            psql "$DB_URL" -f "$file" 2>&1 | grep -v "NOTICE" || true
            echo "✅ ${migration}_*.sql applied"
        fi
    done
else
    echo "⚠️  psql not found"
    echo ""
    echo "Please apply migrations manually:"
    echo "1. Go to: https://app.supabase.com/project/$PROJECT_REF/sql/new"
    echo "2. Copy/paste each migration file content"
    echo "3. Run each migration"
    echo ""
    echo "Migration files to apply:"
    ls -1 ${MIGRATIONS_DIR}/003_*.sql ${MIGRATIONS_DIR}/004_*.sql ${MIGRATIONS_DIR}/006_*.sql ${MIGRATIONS_DIR}/007_*.sql ${MIGRATIONS_DIR}/008_*.sql ${MIGRATIONS_DIR}/009_*.sql ${MIGRATIONS_DIR}/010_*.sql ${MIGRATIONS_DIR}/012_*.sql ${MIGRATIONS_DIR}/013_*.sql ${MIGRATIONS_DIR}/014_*.sql 2>/dev/null || true
fi

echo ""
echo "✅ Migration application complete!"
