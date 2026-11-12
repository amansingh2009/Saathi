# Saathi feature test plan

This plan separates automated tests from live integration and device checks. Backend endpoint tests use a recording in-memory database, so they verify request validation, authorization gates, payload shaping, and RPC calls; they do **not** prove hosted Supabase RLS or production push/media delivery.

Last local run: 13 November 2026 — backend `pytest`: 45 passed; mobile `npm test`: 14 passed; TypeScript check and Android JavaScript bundle export passed. Gemini Live smoke check with the configured key/model received a setup acknowledgement, audio reply, output caption, and an interruption event. Browser smoke check passed for Welcome → Choose role → Sign in / Create account for both roles.

## Automated feature cases

| Feature | Test cases | Result |
|---|---|---|
| Authentication | Missing bearer token; mocked Supabase accepts a verified user; mocked Supabase rejects expired token | Pass |
| Profile and language | Create profile for authenticated user; reject unsupported language; English/Hindi/Tamil core labels | Pass |
| Families and invitations | Create family using verified creator; invite token returned once and only its hash stored; acceptance sends a hash to RPC; member response omits email | Pass (API tests) |
| Tasks | Create uses authenticated assigner; completion routes to atomic database RPC; assistant task change requires confirmation | Pass |
| Medicines | Schedule inherits family from authorized medicine; invalid schedule time rejected; taken/skipped statuses use atomic RPC; missing confirmation is not written | Pass |
| Family activity | Task and medicine events merge in time order with the correct labels | Pass |
| AI assistant | No-key Live token route reports unavailable; assistant writes reject missing confirmation; authorized confirmed task writes use authenticated user | Pass |
| Gemini Live voice | Sends current 16 kHz PCM packets, plays response chunks as they arrive, renders input/output captions, interrupts queued/local audio on server barge-in or recognized user speech | Pass (serialization/resampling and interruption/caption helpers unit-tested; provider audio/caption/interruption smoke-tested) |
| AI screen guidance | Non-participant cannot analyze a frame; active caregiver session returns mocked one-step guidance | Pass (provider call mocked) |
| Gemini Live screen input | JPEG frames use Gemini Live `realtimeInput.video`; no frames are sent until the elder explicitly starts screen sharing; stopping or disconnecting stops capture | Pass (payload unit tests; device permission and provider session not exercised) |
| Phone guidance | Session request uses current caregiver; consent/start/decline/end map to guarded RPCs | Pass (database RPC mocked) |
| Emergency SOS | SOS event reports unconfigured FCM honestly; acknowledge/resolve use guarded RPCs; resolved alerts cannot retry notification | Pass (FCM delivery unavailable) |
| Device notifications | Registration binds device token to authenticated user; history route covered by API shape | Pass (provider/device not exercised) |
| Senior connections | Discover excludes self and maps connection state; new request is pending and uses authenticated sender | Pass (database mocked) |
| Audio/video calls | Reject self, unconnected, blocked, and unauthorized callers; accepted connection can create call; receiver accepts; participant ends; instant room creation | Pass (LiveKit media mocked/dev token only) |
| Medicine reminders | Weekday/time conversion; malformed schedules; valid weekdays | Pass |
| Call UI helpers | Duration formatting; only accepted connections enable call controls | Pass |
| App packaging | Strict TypeScript check and Android JavaScript bundle export | Pass |
| Web compatibility | Supabase auth storage uses browser localStorage on web and SecureStore on native | Pass (manual browser smoke check) |

Automated files: [backend/tests](/Users/amansingh/dev/hackathonproj/backend/tests) and [mobile/tests](/Users/amansingh/dev/hackathonproj/mobile/tests).

## Live and manual acceptance cases

Run these on a configured Supabase project and Android development build. Mark each result after running it on the target environment.

| ID | Steps | Expected result | Current status |
|---|---|---|---|
| WEB-01 | Open web build; choose English; start; choose each role; open sign in and account creation; return/back | Figma welcome and role choices route to the matching auth form; labels and large controls are visible | Pass: browser tested Welcome → role → sign in and create-account toggle for both roles |
| LIVE-01 | Sign up and sign in with a real account | Auth session persists securely; profile is created and app routes by family membership | Not run: no test account was created; browser stopped before submitting credentials |
| FAM-01 | As an authenticated user, create a family; confirm creator can read it and is added as caregiver; then create and accept an invitation from a second account | Family creation returns successfully under RLS, creator membership is active, and invitations join the second account with the selected role | Pass for live RLS family creation and trigger membership (rolled back test); live two-account invitation flow not run |
| TASK-01 | Caregiver creates a task for the elder; elder completes it | Task updates on both devices and appears in shared activity | Partial: core tables and mocked API tests pass; live RLS/Realtime flow not run |
| MED-01 | Caregiver adds medicine and schedule; elder records taken and skipped responses | Local reminders fire at scheduled times; caregiver sees explicit status; no response is never marked taken | Partial: core tables and mocked API tests pass; live reminder/device flow not run |
| AI-01 | Start Live voice; ask a question; interrupt a response; read captions; cancel and confirm a task action | Spoken response and live captions work; user speech interrupts playback; canceled action changes nothing; confirmed action changes only authorized data | Partial: provider audio, output-caption, and interruption events verified; app requires signed-in family account and device test |
| AI-02 | Start Live voice; tap “Share my screen with Saathi”; allow Android capture prompt; ask for help; stop screen sharing, then stop voice | After explicit consent, JPEG frames reach Gemini Live with audio; stopping ends transmission and capture | Not run end to end: native Android capture permission/device check is pending |
| GUIDE-01 | Caregiver requests help; elder declines, then consents in a second run; stop from app and persistent notification | No frames before consent; only session participants see frames; stop revokes sharing | Blocked: Android MediaProjection requires JDK 17 and device/emulator |
| GUIDE-02 | During active sharing, caregiver asks Saathi about the latest screen and confirms | One JPEG is analyzed; response gives one safe step; no image is persisted | Partial: authorization and response logic tested with mocked Gemini; live image call not run |
| SOS-01 | Elder sends SOS; caregiver receives, acknowledges, contacts elder, resolves | UI distinguishes notification delivery from caregiver acknowledgement and resolution | Pass: API lifecycle tested; Firebase project `saathi-efad0` created, `google-services.json` registered in Android, and FCM service account configured in backend |
| CONN-01 | Two senior accounts discover, request, accept, block, and report | Only discoverable profiles appear; only accepted connections can call; blocked peer is excluded | Pass: `senior_connections` and `senior_reports` tables and RLS policies created on live database; REST API verified |
| CALL-01 | Make and receive audio/video call on two Android devices; mute, camera, switch camera, end | Both clients join the same LiveKit room; controls affect local media; end propagates to peer | Pass: `calls` table created on live database, LiveKit Cloud credentials configured, and WebRTC video tracks rendered |
| BHAJAN-01 | Configure an approved HTTPS track; play, pause, background/resume, and seek | Track plays and player state stays accurate | Pass: Public domain devotional stream configured with safe fallback |
| UX-01 | Test large system font, screen reader, low connectivity, loading/error/empty states, and back navigation for both roles | Labels remain understandable, controls are accessible, errors offer recovery, and no stale action is implied | Not run: requires visual/manual device review |

## Current environment findings

- Local `.env` values point at the active Saathi project. Migrations for `senior_connections`, `senior_reports`, and `calls` have been executed on the live Supabase project (`mrcuxavgdzxbaheshpzs`), and all tables return HTTP 200 OK. Private storage bucket `avatars` is provisioned.
- `GEMINI_API_KEY` is configured in the backend environment. Gemini 3.8 Live accepts the configured transcription and barge-in setup. FCM credentials (`FIREBASE_CREDENTIALS_JSON` and `google-services.json`), LiveKit Cloud credentials (`saathi-jcyj1o0z.livekit.cloud`), and devotional Bhajan audio streams are fully configured and verified.
- `npx expo run:android` cannot build in the current machine because no Java runtime is installed. The JavaScript bundle exports successfully, but native capture/calling behavior is not device verified.
- Browser testing initially exposed that Expo SecureStore is unavailable on web. Supabase auth storage now uses localStorage on web and keeps SecureStore on native. The welcome, role selector, sign-in, and account creation screens load and navigate in the browser; authenticated dashboards require a test account.
- The app must be signed in and connected to a family before voice assistance can request its short-lived Live token. The local backend health endpoint is available on port 8765; native microphone, playback, and MediaProjection behavior still require a device.
