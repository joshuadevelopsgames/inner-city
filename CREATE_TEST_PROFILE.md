# Create Test Profile for Demos

This guide helps you create a test user account that can be shared with people for demos and testing.

## 🚀 Quick Method (Recommended)

Use the automated script:

```bash
node scripts/create-test-profile.mjs
```

This will create:
- **Email**: `demo@innercity.app`
- **Password**: `Demo123!`
- **Username**: `demo_user`
- **Display Name**: `Demo User`

### Custom Credentials

You can customize the credentials:

```bash
node scripts/create-test-profile.mjs \
  --email test@example.com \
  --password MyPassword123! \
  --display-name "Test User" \
  --username test_user
```

## 📋 Prerequisites

1. **Environment Variables**: Make sure you have `.env.local` with:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Get Service Role Key**:
   - Go to: https://app.supabase.com/project/gdsblffnkiswaweqokcm/settings/api
   - Copy the **service_role** key (⚠️ Keep this secret!)
   - Add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`

## 🔧 Manual Method

If you prefer to create the test user manually:

### Step 1: Create Auth User

1. Go to Supabase Dashboard: https://app.supabase.com/project/gdsblffnkiswaweqokcm
2. Navigate to **Authentication** → **Users**
3. Click **"Add User"** → **"Create new user"**
4. Fill in:
   - **Email**: `demo@innercity.app`
   - **Password**: `Demo123!`
   - **Auto Confirm User**: ✅ (check this)
5. Click **"Create user"**
6. Copy the **User ID** (UUID)

### Step 2: Create Profile

1. Go to **SQL Editor** in Supabase Dashboard
2. Run this SQL (replace `YOUR_USER_ID_HERE` with the UUID from Step 1):

```sql
INSERT INTO public.profiles (
  id,
  username,
  display_name,
  bio,
  interests,
  home_city,
  verified,
  organizer_tier
) VALUES (
  'YOUR_USER_ID_HERE'::UUID,
  'demo_user',
  'Demo User',
  'This is a demo account for testing Inner City. Feel free to explore!',
  ARRAY['music', 'nightlife', 'events', 'raves', 'concerts'],
  'Berlin',
  false,
  'none'
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  interests = EXCLUDED.interests,
  home_city = EXCLUDED.home_city;
```

## ✅ Verify Test Profile

After creating the profile, verify it works:

1. Open your app
2. Go to login page
3. Sign in with:
   - **Email**: `demo@innercity.app`
   - **Password**: `Demo123!`
4. You should see the demo user profile

## 📤 Sharing Test Credentials

You can share these credentials with testers:

```
Email: demo@innercity.app
Password: Demo123!
```

**Note**: Consider creating multiple test accounts for different scenarios:
- Regular user
- Event organizer
- Verified user

## 🔄 Reset Test Profile

If you need to reset the test profile:

```bash
# Delete and recreate
node scripts/create-test-profile.mjs --email demo@innercity.app --password Demo123!
```

Or manually delete the user in Supabase Dashboard → Authentication → Users, then recreate.

## 🛡️ Security Notes

- ⚠️ **Don't use test credentials in production**
- ⚠️ **Change default password** if sharing publicly
- ⚠️ **Consider rate limiting** test accounts
- ⚠️ **Monitor test account usage** for abuse

## 🎯 Multiple Test Accounts

To create multiple test accounts:

```bash
# Demo account 1
node scripts/create-test-profile.mjs --email demo1@innercity.app --username demo1

# Demo account 2
node scripts/create-test-profile.mjs --email demo2@innercity.app --username demo2

# Organizer account
node scripts/create-test-profile.mjs \
  --email organizer@innercity.app \
  --username organizer \
  --display-name "Event Organizer"
```

Then update the organizer account's `organizer_tier` in the database:

```sql
UPDATE public.profiles 
SET organizer_tier = 'official' 
WHERE username = 'organizer';
```

## 📝 Troubleshooting

### "User already exists"
The script will detect existing users and update their profile instead of failing.

### "Missing Supabase credentials"
Make sure `.env.local` has:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `VITE_SUPABASE_ANON_KEY` as fallback)

### "Profile not created"
The script will retry and create the profile manually if the trigger doesn't work.

### "Permission denied"
Make sure you're using the **service_role** key, not the anon key, for admin operations.
