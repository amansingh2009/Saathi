# Saathi

Saathi is an Android-first family assistance app for older adults and caregivers. The repository contains an Expo/React Native mobile client with Figma-informed core flows, a FastAPI backend, and a provisioned Supabase project with row-level security and Realtime.

## Repository layout

- `mobile/` — Expo Router application, Figma-aligned UI, authenticated Supabase client, local reminders, and Android MediaProjection module.
- `backend/` — FastAPI routes for profiles, families, invitations, tasks, medicines, activity history, guidance, emergencies, notifications, and Gemini Live/screen-guidance APIs.
- `supabase/migrations/` — database tables, RLS policies, guarded RPCs, Realtime authorization, and indexes.
- `docs/` — architecture, API and database references, setup steps, and extracted Figma guidance.

## Start the mobile client

```sh
cd mobile
npm install
npx expo run:android
```

Use an Android development build on a device or emulator. Expo Go cannot load the native screen-capture module. The current local setup runs the API on port 8765, so `mobile/.env` points an Android emulator at `http://10.0.2.2:8765/api/v1`; a physical device needs the development computer's LAN address and port 8765.

## Start the backend

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8765
```

FastAPI docs are available at `http://localhost:8000/docs`.

## Supabase

The Saathi project was created in Mumbai (`ap-south-1`). Its migrations define all 14 requested tables, RLS, least-privilege grants, family-scoped policies, atomic actions, and private guidance rooms. Client requests use the signed-in user's access token and the publishable key; no service-role key is included in the mobile app or required for the current API.

See [setup guide](docs/setup-guide.md), [architecture](docs/architecture.md), [API documentation](docs/api-documentation.md), [database schema](docs/database-schema.md), [Figma reference](docs/design-reference.md), and the [feature test plan](docs/feature-test-plan.md).

The caregiver experience includes a shared task/medicine activity timeline and a consent-gated option to ask Gemini about the latest shared screen. The elderly Bhajan page supports play/pause for one operator-configured licensed HTTPS audio source. These features require Gemini credentials and an approved audio source respectively; empty configuration is shown as a clear setup state.

## Run tests

```sh
cd backend && .venv/bin/pytest -q
cd ../mobile && npx tsc --noEmit && npm test
npx expo export --platform android --output-dir /tmp/saathi-export
```

The feature test plan records automated results and the live Supabase, credential, and Android checks that still need a configured test environment.
