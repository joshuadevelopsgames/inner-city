# GitHub Repository Setup

This document contains instructions for completing the GitHub repository setup.

## ✅ Completed Automatically

- ✅ Repository created: https://github.com/joshuadevelopsgames/inner-city
- ✅ Code pushed to main branch
- ✅ Vercel integration connected
- ✅ Contributing guidelines added
- ✅ Issue templates created
- ✅ Pull request template created
- ✅ CI workflow created

## 🔧 Manual Setup Required

### 1. Branch Protection Rules

Due to API limitations, branch protection must be set up manually:

1. Go to: https://github.com/joshuadevelopsgames/inner-city/settings/branches
2. Click "Add rule" or edit the existing rule for `main`
3. Configure:
   - ✅ Require a pull request before merging
     - Require approvals: 1
   - ✅ Require status checks to pass before merging
     - Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings
   - ✅ Include administrators

### 2. Repository Topics

Topics have been added via CLI. To verify or add more:

1. Go to: https://github.com/joshuadevelopsgames/inner-city
2. Click the gear icon ⚙️ next to "About"
3. Add topics: `react`, `typescript`, `vite`, `supabase`, `vercel`, `event-discovery`, `ticketmaster`, `eventbrite`, `pwa`, `underground-events`

### 3. GitHub Actions Secrets

For CI to work, add these secrets in GitHub:

1. Go to: https://github.com/joshuadevelopsgames/inner-city/settings/secrets/actions
2. Click "New repository secret"
3. Add:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
   - (Optional) `VITE_TICKETMASTER_API_KEY`
   - (Optional) `VITE_MAPBOX_ACCESS_TOKEN`
   - (Optional) `VITE_EVENTBRITE_API_TOKEN`

### 4. Repository Description

Update the repository description on GitHub:

1. Go to: https://github.com/joshuadevelopsgames/inner-city
2. Click the gear icon ⚙️ next to "About"
3. Add description: "Underground event discovery app - Discover warehouse raves, underground parties, and exclusive events in your city"

## 📋 What's Already Set Up

- ✅ Git repository initialized
- ✅ All code committed and pushed
- ✅ `.gitignore` configured
- ✅ `README.md` with project documentation
- ✅ `CONTRIBUTING.md` with contribution guidelines
- ✅ Issue templates (bug report, feature request)
- ✅ Pull request template
- ✅ CI workflow (runs on push/PR)
- ✅ Vercel auto-deployment

## 🚀 Next Steps

1. Complete the manual setup steps above
2. Test the CI workflow by creating a test PR
3. Verify Vercel deployments are working
4. Start contributing! 🎉
