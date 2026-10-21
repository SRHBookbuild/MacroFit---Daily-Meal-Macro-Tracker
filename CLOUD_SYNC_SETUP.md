# MacroFit cloud sync setup

The cloud feature is **disabled** until configured. The existing daily and weekly journal continues locally.

1. Export a JSON backup from MacroFit on your desktop, and separately on your phone if it contains entries.
2. Create a free Supabase project at https://supabase.com/dashboard.
3. Open Supabase **SQL Editor** and run `supabase-schema.sql`. This enables owner-only row-level security.
4. In **Authentication > Providers > Email**, enable email OTP / magic link.
5. In **Authentication > URL Configuration**, use Site URL `https://srhbookbuild.github.io/MacroFit---Daily-Meal-Macro-Tracker/` and add this full URL to Redirect URLs.
6. In **Project Settings > API** (or Connect), copy the project URL and **publishable/anon** key into the `CONFIG` at the top of `cloud-sync.js`. These client-facing values are safe to put in a public site **only with RLS enabled**. Never use the service_role/secret key.
7. Deploy the updated files through GitHub Pages. On the desktop, sign in, choose **Upload this device's copy** if asked. After it reports Synced, sign in on your phone and choose **Use cloud copy on this device**.
8. Once the cloud journal is established, subsequent changes sync automatically when online. Conflicting simultaneous edits require manually choosing a copy, not automatic merging.

## Limitations
- The app uses a single JSON journal per user. It avoids silent cloud overwrite if a newer remote version is detected but does not merge simultaneous edits.
- Keep JSON backups, particularly before your first sync.
- A linked local file remains a separate storage mechanism.
- Cloud syncing requires an internet connection and Supabase project configuration.
