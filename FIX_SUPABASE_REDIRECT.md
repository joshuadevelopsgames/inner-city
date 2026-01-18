# Fix Supabase Auth Redirect URL

## Problem
When signing up through Supabase, users are redirected to `localhost` instead of your production URL.

## Solution

### Step 1: Update Supabase Dashboard Settings

1. Go to your Supabase Dashboard: https://app.supabase.com/project/gdsblffnkiswaweqokcm
2. Navigate to **Authentication** → **URL Configuration**
3. Update the following settings:

#### Site URL
Set this to your production URL:
```
https://your-production-domain.vercel.app
```

Or if you have a custom domain:
```
https://yourdomain.com
```

#### Redirect URLs
Add both your production and localhost URLs (for development):

**Production:**
```
https://your-production-domain.vercel.app/**
```

**Development:**
```
http://localhost:5173/**
http://localhost:5174/**
```

**Note:** The `**` wildcard allows all paths under that domain.

### Step 2: Verify Code Changes

The code has been updated to automatically use the current window location for redirects. This means:
- In development: redirects to `http://localhost:5173`
- In production: redirects to your production URL

### Step 3: Test

1. **Local Development:**
   - Start your dev server: `npm run dev`
   - Sign up a new user
   - Should redirect to `http://localhost:5173` after email confirmation

2. **Production:**
   - Deploy to Vercel
   - Sign up a new user
   - Should redirect to your production URL after email confirmation

## Quick Fix Checklist

- [ ] Update **Site URL** in Supabase Dashboard → Authentication → URL Configuration
- [ ] Add production URL to **Redirect URLs** list
- [ ] Add localhost URLs to **Redirect URLs** list (for development)
- [ ] Test signup in development
- [ ] Test signup in production

## Example Configuration

```
Site URL: https://inner-city.vercel.app

Redirect URLs:
- https://inner-city.vercel.app/**
- http://localhost:5173/**
- http://localhost:5174/**
```

## Troubleshooting

### Still redirecting to localhost in production?
1. Check that your **Site URL** is set to production
2. Verify the production URL is in the **Redirect URLs** list
3. Clear browser cache and cookies
4. Check browser console for errors

### Email confirmation not working?
1. Check **Authentication** → **Settings** → **Enable email signup** is ON
2. Check **Confirm email** setting (OFF for testing, ON for production)
3. Check spam folder for confirmation emails

### Multiple redirect URLs?
You can add multiple URLs to support:
- Production domain
- Staging domain
- Local development
- Custom domains

Just add each one to the **Redirect URLs** list.
