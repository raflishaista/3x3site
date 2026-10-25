# Supabase setup

Run `npm install` once, then `npm run dev`. Open http://localhost:3313.
Node 20.12 or later is required.

Keep credentials in `.env` (ignored by Git). The browser receives only SUPABASE_URL
and SUPABASE_PUBLISHABLE_KEY. DATABASE_URL is used only by the database setup script.
Use the Session pooler URL from Supabase Connect if the direct host is unavailable.
URL-encode special characters in the database password.

Download the database CA certificate from Database Settings > SSL Configuration
and save it as `supabase/prod-ca-2021.crt`. Run `npm run db:setup` once to create
the profile table, image bucket, and row-level security policies. Setup verifies TLS.

In Authentication > URL Configuration, set Site URL to http://localhost:3313
and add http://localhost:3313/** to Redirect URLs. Enable email/password sign-in.

Register with an email and password. If email confirmation is enabled, follow the
confirmation link in the same browser, then log in. To test multiple accounts,
register a second email and log out before switching. Each account owns a separate
profile. Names are display names, not unique login identifiers.

Profiles and uploaded images are public; only the owner can save a profile or
upload to their image folder. Never put secrets in profile text. Original local
mock profiles are preserved in IndexedDB; they are not automatically uploaded.

The app stores ordered collections and crop/description/link data in one JSON
profile row and original images (including GIFs) in Storage. Replaced images are
retained for now; automatic cleanup of unreferenced images is not implemented.
The application does not yet include a password-reset screen.

Run `npm test` for local checks.

If the database connection rejects your password, run the contents of
`supabase/schema.sql` directly in Supabase's SQL Editor instead. The running app
needs only the project URL and publishable key, not a database password.
