# Architecture

## Applications

- `mobile/` is an Expo SDK 58 React Native app. Expo Router separates auth, elderly, and caregiver routes. TanStack Query handles API state, Zustand stores language and selected-family preferences, and SecureStore persists Supabase sessions and preferences.
- `backend/` is a Python FastAPI service. It validates bearer sessions through Supabase Auth, forwards each user's access token to PostgREST, and relies on database RLS for family authorization. It never elevates routine requests to a service-role identity.
- `supabase/` contains versioned SQL migrations. PostgreSQL is the source of truth for membership, task completion, medicine logs, consent, emergencies, and notification delivery history.

## Data and privacy boundaries

Every public application table has RLS enabled and explicit grants. Family-scoped policies resolve active memberships; atomic security-definer RPCs validate the actor and role before recording sensitive state changes. Profile reads exposed to family members are limited to name, phone, and language. Invitation tokens are random, returned once, stored as SHA-256 hashes, and expire.

Realtime Postgres changes are filtered by RLS. Screen guidance uses a separate private topic per session: only the two session participants can receive events, only the elder can publish frames, and the session must be active. Frames are resized and JPEG compressed on-device, relayed as transient Realtime messages, and are not inserted into application storage. The Android user must approve MediaProjection and can stop it from the app or persistent notification. Remote control is not implemented.

## Integrations

- Gemini credentials stay on the backend. The backend creates a one-use, short-lived Live token; the mobile app streams 16 kHz PCM while the voice session is active and plays returned audio. Mutating tool calls pause for an explicit in-app confirmation and are authorized again by the backend and database. For screen guidance, the caregiver must explicitly ask Saathi and confirm before the current JPEG frame is sent to Gemini. The API requires that caregiver to own an active, consented session, limits the image size, and does not store the frame.
- The devotional player reads one HTTPS track from local Expo configuration. A licensed provider or track must be supplied by the app operator; no audio is bundled by default.
- FCM is sent by the backend using Firebase Admin credentials. Device tokens are registered with the current authenticated account. Emergency records remain open until a caregiver acknowledges and resolves them; notification delivery is tracked separately.
- Medicine reminders are scheduled locally from database schedules. Missing responses do not create a `not_confirmed` log and are never treated as taken.

## Operational limits

Gemini Live needs a server API key. Push delivery needs Firebase service-account credentials and an Android Firebase configuration file for native token provisioning. Android screen sharing needs a development build and a real system permission prompt. These device integrations require physical-device verification before release. Devotional audio content is not bundled; a licensed source must be configured.
