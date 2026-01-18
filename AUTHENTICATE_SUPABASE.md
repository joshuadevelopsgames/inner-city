# Authenticate Supabase CLI

## Option 1: Interactive Login (Recommended)

Open your terminal and run:

```bash
cd /Users/joshua/Downloads/copy-of-inner-city
supabase login
```

This will:
1. Open your browser
2. Ask you to sign in to Supabase
3. Authorize the CLI
4. Save your access token

After logging in, you can then:

```bash
# Link your project
supabase link --project-ref gdsblffnkiswaweqokcm

# Push the migration
supabase db push
```

## Option 2: Use Access Token

If you prefer not to use interactive login:

1. **Get your access token:**
   - Go to: https://app.supabase.com/account/tokens
   - Click "Generate new token"
   - Copy the token

2. **Set it as environment variable:**
   ```bash
   export SUPABASE_ACCESS_TOKEN="your_token_here"
   ```

3. **Then run:**
   ```bash
   supabase link --project-ref gdsblffnkiswaweqokcm
   supabase db push
   ```

## Option 3: Quick Manual Fix (Fastest)

If you just want to fix it quickly without CLI:

1. Go to: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new
2. The SQL is already in your clipboard (from previous step)
3. Paste (Cmd+V) and click "Run"

This will immediately fix the trigger function!
