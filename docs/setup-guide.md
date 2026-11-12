# Setup guide

## Configuration

`mobile/.env` and `backend/.env` are already configured with the Saathi Supabase URL and publishable key. They are ignored by Git. Copy each `.env.example` if recreating the local setup.

Backend variables:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWT_ISSUER` identify the project. Auth verifies the user's access token; requests then use that same token with RLS. `SUPABASE_SERVICE_ROLE_KEY` is not needed and must never be copied to mobile.
- `GEMINI_API_KEY` is needed for `/ai/live-token`; keep it only in `backend/.env`.
- `GEMINI_SCREEN_MODEL` optionally selects the image-analysis model for `/ai/guidance-image` (default `gemini-2.5-flash`). The same server-side Gemini API key is used.
- `FIREBASE_CREDENTIALS_JSON` is the server Firebase service-account JSON as a single-line JSON value. It is needed for FCM delivery.

Mobile variables:

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configure Supabase Auth.
- `EXPO_PUBLIC_API_BASE_URL` is the FastAPI URL reachable from the device. This workspace uses `http://10.0.2.2:8765/api/v1` for an Android emulator. For a physical device, use the development computer's LAN IP and allow local network access.
- `EXPO_PUBLIC_BHAJAN_URL`, `EXPO_PUBLIC_BHAJAN_TITLE`, and `EXPO_PUBLIC_BHAJAN_ARTIST` configure one HTTPS track that Saathi is licensed to stream. Leave the URL empty until a source is approved.

## Mobile development

1. Install Node.js 20+, Java 17, and Android Studio with an Android SDK.
2. From `mobile/`, run `npm install`.
3. Start the API in a separate terminal (see Backend below).
4. Run `npx expo run:android` to build and install the development app. `npx expo start` is useful for JavaScript-only work; Android MediaProjection needs the native development build.
5. In Android settings, permit Saathi notifications and microphone use when prompted. Screen sharing separately presents Android's system capture consent and a persistent Stop sharing notification.

For FCM on Android, add the Firebase project's `google-services.json` to `mobile/`, configure Expo/Gradle to include it, and set the matching Firebase service account in the backend. The repository does not include either Firebase credential.

## Backend development

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8765
```

Open `http://localhost:8000/docs` for OpenAPI. Install dependencies from `backend/requirements.txt`; run `pytest -q` from `backend/`.

## Database

The originally provisioned project `mrcuxavgdzxbaheshpzs` is active in Mumbai (`ap-south-1`) and has all SQL migrations applied. The local `.env` now points to the separately supplied project `yxzgpkizegnitwkxmoyf`; its Auth health endpoint is reachable, but its Data API currently returns `404` for Saathi tables. The management connector does not have permission to this second project, so its migrations still need to be applied after connecting that project in Supabase. Until then, sign-in may work, but family, task, and medicine APIs cannot run against that database.

## Known external/device requirements

- Gemini Live requires a valid API key and currently configured Live model access.
- AI screen guidance requires Gemini credentials and sends a frame to Google only when a caregiver asks and confirms. Avoid sending screens that show private codes or financial details.
- FCM requires Firebase service-account credentials and native Android Firebase configuration. Until configured, SOS records are still created and report `not_configured`; the UI does not say a caregiver was notified.
- Android MediaProjection and FCM token provisioning need a development build. The screen-capture module was autolinked and Expo prebuild completed, but no Android device test was available in this environment.
- Bhajan playback needs a licensed audio provider or media files; no unlicensed placeholder stream is bundled.
- The Supabase dashboard currently reports moderate security-definer RPC advisories for the intentionally callable, guarded atomic functions. Review the role checks documented in [database schema](database-schema.md) before changing their grants.
