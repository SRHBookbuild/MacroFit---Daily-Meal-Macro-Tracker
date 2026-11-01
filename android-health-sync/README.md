# MacroFit Android Health Sync (prototype)

This folder is a separate Android Studio Kotlin project. It **does not modify** the existing MacroFit website or its Supabase journal.

## Intended flow
1. Open this folder in Android Studio (Gradle JDK 17, Android SDK 35).
2. Build/install the Android app; **no APK is supplied yet**.
3. In Supabase Auth email templates, configure email OTP with `{{ .Token }}`. The current website's magic-link sign-in is a different flow; do not change it without testing.
4. Sign in using the same MacroFit account, grant Health Connect WRITE_NUTRITION.
5. Confirm MacroFit website says cloud journal synced. Tap **Sync Now**.
6. In Samsung Health, allow Health Connect nutrition **read** permission and test whether imported nutrition is displayed.
7. Optionally enable periodic sync. Android schedules WorkManager jobs approximately every 15 minutes or later, not instantly.

## Prototype limitations — not ready for routine use
- Source code has not been compiled or tested on a device; APIs/dependencies may need corrections.
- Deleting/reordering foods in MacroFit can leave obsolete Health Connect records because stable per-entry IDs and deletion reconciliation are not yet implemented.
- The sync processes the entire journal and uses array positions as client record IDs; production needs stable IDs, change tracking, and idempotent upserts.
- The companion uses app-private preferences for a refresh token; production should encrypt credentials and provide sign-out.
- Meals are given approximate times (8am/noon/4pm/8pm), since the journal does not record meal timestamps.
- Missing nutrient values may be written as zero; production should preserve unknown values as absent.
- Health Connect compatibility does not guarantee Samsung Health's Food interface displays every imported record.
- Verify Supabase row-level security restricts journal access to the authenticated user.
- Do not distribute this prototype as a finished APK until it passes compilation and device testing.
