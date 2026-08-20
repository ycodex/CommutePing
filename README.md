# Commute Ping Mobile

Android and iOS implementation of Commute Ping, built with Expo and React Native.

## Implemented

- Figma-inspired dark mobile interface with Track, Routes, Alerts, and Safety screens
- Explicit route selection followed by a single Start Commute / Stop Commute control
- Guided Android/iOS route planner with separate start/destination selection, place search results, map-tap selection, current-location selection, swap control, schedule presets, and locally saved coordinates
- Saved-route selection before commute start, with the selected route and current GPS position shown on the Track screen
- Accuracy-aware route-deviation engine with repeated-sample confirmation and recovery hysteresis for road-following route geometry
- Expected-arrival status with a 10-minute late grace window and locally recorded late incidents
- Accuracy-aware prolonged-idle checks that prompt after 8 minutes without meaningful movement
- Conservative, experimental fall and snatch candidate classifiers using accelerometer and gyroscope readings, with a 10-second cancellation screen
- Local incident history for safe arrival, late arrival, idle, battery, route-deviation, sensor candidates, and SOS actions, with incident-only clearing
- Contextual contact permission, native phone-contact picker, visible trusted-contact list, and individual contact deletion
- Foreground location permission and live location updates during an active commute
- Battery-aware tracking profiles: Precise, Balanced, and Saver
- Accelerometer and gyroscope readings during active commutes
- Locally persisted route, trusted-contact, alert-preference, and sensor-preference flows, with individual route deletion
- User-initiated SOS photo/video capture to temporary app storage and user-initiated calls through the system phone dialer
- Runtime error boundary so a platform-module failure cannot silently leave a blank safety screen

## Run locally

Requirements: Node.js, npm, Android Studio for Android, and Xcode on macOS for iOS.

```bash
npm install
npm start
```

From the Expo terminal, press `a` for Android or `i` for iOS. You can also use:

```bash
npm run android
npm run ios
```

The first commute start asks for foreground location permission. Location is displayed on this device only. Motion sensors run only while a commute is active and the corresponding safety setting is enabled.

Routes created by the current picker are endpoint previews, not turn-by-turn road paths, so the app intentionally does not raise deviation warnings for them. A routing provider must supply road-following geometry before monitoring is enabled.

A standalone Android release requires `GOOGLE_MAPS_ANDROID_API_KEY` at build time. A Google-powered iOS map can use the separate `GOOGLE_MAPS_IOS_API_KEY`; without it, iOS uses Apple Maps. Copy `.env.example` for local builds and configure the equivalent EAS environment variables for cloud builds. Restrict the keys to the matching Maps SDK, app identifier, and signing identity, and never commit them. Google Places/Routes web-service credentials should be held by a backend, not embedded in the public mobile bundle.

Adding `expo-camera` changes the native runtime, so version 1.1.0 needs a newly installed APK/IPA. An update cannot add the camera module to an older 1.0.0 binary.

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

EAS Update requires a compatible preview or production build on the phone. It is not a replacement for the local Expo Go development server.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor@latest
```

## Not connected yet

This build does not send data to trusted contacts. Google road routing, automatic rerouting, background tracking, remote push notifications, automated calls, automatic evidence sharing, authentication, encrypted backend storage, server-side escalation, automated route learning, production-trained motion classification, and cell-tower fallback are not connected. The UI labels these capabilities accordingly.

The SOS call action opens the device dialer; the user must confirm the call. Camera files remain in temporary app cache for the current session and are not uploaded or sent automatically.

Fall/snatch candidates, ETA, battery, idle, and route checks currently run only while the app is open in an active foreground commute. Sensor thresholds are deliberately conservative and experimental; they open an on-device cancellation flow and never contact emergency services automatically.

Commute Ping is an assistive coordination tool. It must not claim to guarantee rescue or emergency response.

## Suggested next milestone

Add a backend-held Google Places/Routes integration that upgrades endpoint previews to road-following geometry, then add consent-based onboarding, authentication, and trusted-circle commute sessions before enabling remote notifications or escalation.
