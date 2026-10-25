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

Set Authentication > Email Templates > Confirm signup to the contents of
supabase/confirmation-email.html. This sends {{ .Token }} as an email code.
Register with a username, email, and password, then enter the code on the same
registration page. A resend button is available. Each account owns a separate
profile. Usernames are unique and form the public /username URL; login uses email.

Run supabase/usernames.sql in the SQL Editor after schema.sql to add usernames
to existing profiles and enforce uniqueness. Existing profile data is preserved.
Profile editing is at /username/edit and account forms are /login and /register.
The local server serves clean URLs on refresh; deployed hosting must also rewrite
application routes to index.html.

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
