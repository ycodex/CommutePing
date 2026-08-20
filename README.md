# Commute Ping Mobile

Android and iOS implementation of Commute Ping, built with Expo and React Native.

## Implemented

- Figma-inspired dark mobile interface with Track, Routes, Alerts, and Safety screens
- Explicit route selection followed by a single Start Commute / Stop Commute control
- MapLibre Native maps with a configurable style provider; the prototype defaults to the OpenFreeMap Liberty style and does not require a Google Maps key
- Guided Android/iOS route planner with separate start/destination selection, device place search, map-tap selection, current-location selection, swap control, schedule presets, and locally saved coordinates
- OSRM-compatible road-route calculation with strict response validation; the prototype defaults to the public OSRM demo service
- Saved-route selection before commute start, with the full road path and current GPS position shown on the Track screen
- Accuracy-aware route-deviation engine with repeated-sample confirmation and recovery hysteresis for road-following route geometry
- Expected-arrival status with a 10-minute late grace window and locally recorded late incidents
- Accuracy-aware prolonged-idle checks that prompt after 8 minutes without meaningful movement
- Conservative, experimental fall and snatch candidate classifiers using accelerometer and gyroscope readings, with a 10-second cancellation screen
- Local incident history for safe arrival, late arrival, idle, battery, route-deviation, sensor candidates, and SOS actions, with incident-only clearing
- Contextual contact permission, native phone-contact picker, visible trusted-contact list, and individual contact deletion
- Foreground location permission and live location updates during an active commute
- Optional connected mode backed by Supabase: mobile OTP sign-in, one-time phone-bound invitations, accepted trusted circles, shared commute sessions, and a separate People I Monitor view
- Background location updates for an explicitly started shared commute, with an Android foreground-service notice and the iOS background-location indicator
- Private Realtime refresh events and row-level access checks so only the traveller and accepted contacts snapshotted into a commute can read its live state
- Generic push alerts for commute start, trusted-contact acknowledgement, confirmed route deviation, cancellation, and safe completion
- Trusted-contact revocation that immediately blocks API reads for active and historical shared commutes; realtime messages contain only a change signal, never coordinates
- Secure native session storage, server-side notification outbox, rate-limited expiring invitations, and strict client/server payload validation
- Battery-aware tracking profiles: Precise, Balanced, and Saver
- Accelerometer and gyroscope readings during active commutes
- Locally persisted route, trusted-contact, alert-preference, and sensor-preference flows, with individual route deletion
- Visible foreground emergency evidence after manual SOS, an uncancelled fall/snatch candidate, or a confirmed route deviation: one rear photo followed by up to 30 seconds of rear video
- User-initiated calls through the system phone dialer
- Runtime error boundary so a platform-module failure cannot silently leave a blank safety screen

## Run locally

Requirements: Node.js, npm, Android Studio for Android, and Xcode on macOS for iOS.

```bash
npm install
npm start
```

MapLibre includes native code, so this project does **not** run in Expo Go. Install a development/preview build first, then start Metro and press `a` or `i`. You can also use:

```bash
npm run android
npm run ios
```

The first local commute asks for foreground location permission. A connected shared commute separately explains and requests background location because trusted contacts need progress after the phone is locked. Motion sensors run only while a commute is active and the corresponding safety setting is enabled.

Routes created by the picker contain road-following geometry and are drawn on the active commute map. Older endpoint-only routes are upgraded from the configured routing service before the commute starts. Deviation monitoring uses repeated accurate samples and recovery hysteresis.

No Google Maps API key is required. Provider endpoints can be changed at build time:

```bash
EXPO_PUBLIC_MAP_STYLE_URL=https://your-provider.example/styles/commute.json
EXPO_PUBLIC_ROUTING_BASE_URL=https://your-router.example
```

Only HTTPS URLs are accepted. The defaults are useful for prototype testing, but neither OpenFreeMap nor the public OSRM demo router should be treated as an availability-guaranteed product backend. For production, configure a contracted OSM-compatible provider or self-host the map style/tiles and routing service. Do not point this app directly at the community `tile.openstreetmap.org` servers as an unlimited production backend.

Adding MapLibre Native changes the native runtime, so this version needs a newly installed APK/IPA. An over-the-air update cannot add MapLibre to an older binary.

## Connect two phones

The traveller and trusted contact use the same app:

1. Deploy the schema and notification function in [`supabase/README.md`](./supabase/README.md).
2. Configure only these public values for local Expo/EAS builds:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
   ```

3. Install a fresh native build on both physical phones. Expo Go cannot run MapLibre or the complete background-location flow.
4. On each phone, open **Safety & Trusted Circle**, sign in with mobile OTP, and enable alerts. The trusted contact must use the exact number selected by the traveller.
5. The traveller creates and directly shares a 24-hour invitation. The contact accepts it in the app.
6. The traveller saves/selects a road route and starts the commute. Accepted contacts receive a generic push when registered and can open **People I Monitor** for the route, last-update freshness, battery, movement, ETA, and deviation state.
7. **Stop Commute** marks safe arrival, ends background updates, and queues the completion alert.

Phone authentication requires an SMS provider in Supabase. Production SMS delivery to Indian numbers also requires the provider's applicable TRAI DLT setup. Push delivery requires the Edge Function and scheduled retry described in the backend README. Never put the Supabase service-role key, SMS credentials, Expo access token, or cron secret in an `EXPO_PUBLIC_` variable.

## Web preview

The static Expo web build is configured for the GitHub Pages repository path at `https://ycodex.github.io/CommutePing/`.

```bash
npm run export:web
```

The generated site is written to `dist/`. Native-only capabilities are presented as previews on the web; location, motion, contacts, and other device permissions must be tested on Android or iOS.

## Expo preview

The app is linked to the [`@ycodex/commute-ping`](https://expo.dev/accounts/ycodex/projects/commute-ping) EAS project. Preview builds use the `preview` update channel; Android preview builds are installable APKs.

```bash
npx eas-cli@latest update --channel preview --environment preview --message "Describe the update"
npx eas-cli@latest build --profile preview --platform android
```

The manual **Build Android preview APK** GitHub Actions workflow runs in the existing `google_map_api_key` GitHub environment (the environment name is retained so its existing Expo credentials keep working). It requires only an `EXPO_TOKEN` repository or environment secret with access to the `@ycodex/commute-ping` project. MapLibre does not use the old Google Maps secret.

EAS Update requires a compatible preview or production build on the phone. It is not a replacement for the local Expo Go development server.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor@latest
```

## Current safety boundaries

Connected sharing, authenticated monitoring, background location, and push outbox delivery are implemented in the repository, but they remain unavailable until a Supabase project is deployed and the two public build values are configured. This repository does not contain production credentials.

Automatic rerouting, automatic confirmation calls, server-side late/offline watchdogs, evidence upload/sharing, automated route learning, production-trained motion classification, police/monitoring-center integration, and cell-tower fallback are not implemented yet. The monitor shows last-update freshness so a contact can notice delayed location, but the server does not yet generate a timed offline alert.

The SOS call action opens the device dialer; the user must confirm the call. Camera files remain in temporary app cache for the current session and are not uploaded or sent automatically. Emergency capture is deliberately foreground-only and visible: mobile operating systems do not permit a normal cross-platform app to start stealth camera recording while fully backgrounded. Camera and microphone permissions must be granted, and closing the evidence screen stops recording.

Fall/snatch candidates, ETA, battery, idle, and route-deviation classification run while the app is open in an active commute. Background GPS heartbeats continue for a connected commute, but background execution does not run the experimental sensor classifiers. Sensor thresholds are deliberately conservative and open an on-device cancellation flow; they never contact emergency services automatically. A confirmed foreground route deviation or uncancelled motion candidate opens the visible evidence screen.

Commute Ping is an assistive coordination tool. It must not claim to guarantee rescue or emergency response.

## Suggested next milestone

Deploy and test the connected flow with two physical phones, replace the prototype map/routing defaults with contracted or self-hosted providers, then add a server-side late/location-delayed watchdog and push-receipt processing before any escalation or calling workflow.
