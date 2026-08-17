# Commute Ping Mobile

Android and iOS implementation of Commute Ping, built with Expo and React Native.

## Implemented in this first slice

- Figma-inspired dark mobile interface with Track, Routes, Alerts, and Safety screens
- Explicit one-tap commute start and safe-arrival closure
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
