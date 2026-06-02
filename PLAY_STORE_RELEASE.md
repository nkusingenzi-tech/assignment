# Freeman Play Store Release Checklist

## Current Build

- Package name: `com.freeman.mvp`
- Version name: `1.0.1`
- Version code: `2`
- Minimum Android: API 26
- Target Android: API 36
- Play upload artifact: `android/app/build/outputs/bundle/release/app-release.aab`

## Signing

The project is configured for a private upload keystore:

- Keystore file: `android/app/upload-keystore.jks`
- Local signing properties: `android/upload-keystore.properties`
- Alias: `freeman-upload`

The keystore and signing properties are intentionally ignored by Git. Back them up somewhere private. Losing the upload key can block future app updates until Google approves a reset.

Release SHA-1:

```text
3C:03:44:18:0F:53:F8:53:3E:21:EA:59:43:3F:54:5C:5F:6A:05:E0
```

Release SHA-256:

```text
20:9B:68:D2:F4:27:66:04:15:65:7A:00:FD:FF:44:01:44:68:D7:BF:ED:10:96:8B:8A:99:7F:09:FC:DE:CB:CA
```

These fingerprints must stay registered in Firebase for Google sign-in.

## Build Commands

Phone testing APK:

```powershell
cd android
.\gradlew.bat assembleRelease --no-daemon
```

Play Store AAB:

```powershell
cd android
.\gradlew.bat bundleRelease --no-daemon
```

## Firebase And Backend

Required Firebase configuration:

- Firebase Auth enabled for Email/Password.
- Firebase Auth enabled for Google.
- Android app registered as `com.freeman.mvp`.
- Release SHA-1 and SHA-256 added.
- Firestore rules published for profiles and browser pairing.

Required Render backend:

- AI proxy endpoint deployed and reachable.
- Branded verification email endpoint deployed and reachable.
- Resend domain verified.
- `FIREBASE_SERVICE_ACCOUNT_JSON`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and OpenRouter env values set in Render.

## Monetization

Freeman is now a free app. The current release does not use paid plan gating or subscription infrastructure.

If you later decide to add monetization back, document the payment flow separately and keep the free build unaffected.

## Play Console Declarations

Prepare these before review:

- App contains ads: **Yes**.
- Privacy policy URL: `https://www.freemanapp.online/privacy` or current Render URL `/privacy`.
- Terms URL: `https://www.freemanapp.online/terms` or current Render URL `/terms`.
- Account deletion URL: `https://www.freemanapp.online/delete-account` or current Render URL `/delete-account`.
- Developer website / support URL: `https://www.freemanapp.online/`.
- app-ads.txt URL: `https://www.freemanapp.online/app-ads.txt`.
- Data Safety form: account info, app activity/recovery settings, diagnostics if collected.
- VPN declaration: Freeman uses Android VPN APIs for local content filtering.
- Foreground service declaration: content blocker foreground service.
- Content rating questionnaire.
- App access instructions for reviewers, including a test account.

## Final Manual QA

- Clean install starts onboarding before auth.
- Email signup sends verification and verified login works.
- Google sign-in works.
- Daily start check-in and night check-in work.
- Missed night check-in behavior is correct.
- Relapse freeze/reset behavior is correct.
- Rank-up animation triggers correctly.
- AI assistant reaches deployed backend.
- Content blocker agreement appears before blocker controls.
- Content blocker can turn on/off without trapping internet.
- Widget add/open flow works.
- Browser extension pairing works only for paid entitlement.
