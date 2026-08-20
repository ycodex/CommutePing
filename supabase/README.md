# Connected commute backend

This directory contains the deny-by-default Supabase schema and the notification outbox dispatcher for two-phone commute sharing.

## Deploy

1. Create a Supabase project and enable Phone Auth with a supported SMS provider. For India, complete the provider's TRAI DLT registration before production SMS traffic.
2. Link this directory with `npx supabase link --project-ref YOUR_PROJECT_REF`.
3. Apply migrations with `npx supabase db push`.
4. Set Edge Function secrets. Never use the service-role key in the mobile app:

   ```bash
   npx supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   npx supabase secrets set SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SECRET
   npx supabase secrets set CRON_SECRET=REPLACE_WITH_A_LONG_RANDOM_VALUE
   ```

   If Expo push access security is enabled for the EAS project, also set `EXPO_ACCESS_TOKEN`. Set `ALLOWED_ORIGINS` only when an authenticated web deployment needs to invoke the function; native apps do not require a browser origin.

5. Deploy with `npx supabase functions deploy dispatch-notifications --no-verify-jwt`. The function performs its own JWT or cron-secret verification.
6. Put only the project URL and publishable key in the Expo/EAS public environment using the names in the repository `.env.example`.

## Scheduled delivery

The mobile app invokes the dispatcher immediately after start, acknowledge, deviation, and completion actions. Also configure a one-minute scheduled request to cover transient client failures. Failed outbox rows can be reclaimed up to ten times. Store both the function URL and cron secret in Supabase Vault and call the function with `pg_cron`/`pg_net`; do not place the cron secret in a migration or the mobile bundle.

The dispatcher handles push tickets and disables tokens rejected as `DeviceNotRegistered`. Production hardening should also poll Expo push receipts and retain operational metrics without logging phone numbers, coordinates, tokens, or invitation codes.

## Privacy boundaries

- A trusted contact must authenticate with the exact invited phone number and explicitly accept the one-time 24-hour invite.
- Location is readable only by the traveller and guardians snapshotted into that commute.
- Lock-screen notification text is generic; coordinates and contact names are never placed in push payload text.
- Push tokens are inaccessible to mobile clients and are used only by the service-role dispatcher.
- Service-role, SMS-provider, Expo access, and cron credentials remain server-side.
- Detailed evidence upload is deliberately excluded from this milestone.

## Local migration regression check

The SQL files in `tests/` provide minimal Supabase-compatible stubs for a plain PostgreSQL database. The regression flow covers phone-bound invitation acceptance, commute creation, foreground/background heartbeats, guardian monitoring, acknowledgement, and immediate access loss after revocation. Run the migration and both test files with `psql -v ON_ERROR_STOP=1` in that order; they are validation fixtures and must not be deployed.
