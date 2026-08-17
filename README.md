# Commute Ping Mobile

Android and iOS implementation of Commute Ping, built with Expo and React Native.

## Implemented in this first slice

- Figma-inspired dark mobile interface with Track, Routes, Alerts, and Safety screens
- Explicit one-tap commute start and safe-arrival closure
- Searchable Android/iOS route planner with map-tap selection, current-location selection, and locally saved start/destination coordinates
- Contextual contact permission and native phone-contact picker that prefills the local trusted-contact form
- Foreground location permission and live location updates during an active commute
- Battery-aware tracking profiles: Precise, Balanced, and Saver
- Accelerometer and gyroscope readings during active commutes
- Locally persisted route, trusted-contact, alert-preference, and sensor-preference flows
- Explicit SOS demo and truthful capability states where production services are not connected
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

The route planner works in Expo Go on Android and iOS. A standalone Android release requires a restricted Google Maps SDK key before store distribution; do not commit that key to the repository.

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

This slice does not send data to trusted contacts. Background tracking, remote push notifications, automated calls, camera evidence capture, authentication, encrypted backend storage, server-side escalation, automated route learning, fall/snatch classification, and cell-tower fallback are not connected. The UI labels these capabilities accordingly.

Commute Ping is an assistive coordination tool. It must not claim to guarantee rescue or emergency response.

## Suggested next milestone

Add consent-based onboarding and authentication, then build the trusted-circle backend and background commute session before enabling remote notifications or escalation.
