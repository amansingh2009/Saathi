# API documentation

Base path: `/api/v1`. Interactive OpenAPI is served at `/docs`. All product routes require a Supabase access token as `Authorization: Bearer <access_token>`. FastAPI validates the token through Supabase Auth; database calls reuse the user's token so RLS remains authoritative.

## Profiles and family

- `GET /profiles/me`, `PATCH /profiles/me`
- `POST /families`, `GET /families`, `GET /families/{family_id}`
- `POST /families/{family_id}/invite`, `POST /invitations/accept`, `GET /families/{family_id}/members`

Invitations optionally bind to an email, expire within one to seven days, and return a one-time code for sharing. The database stores only its hash.

## Tasks and medicines

- Tasks: `POST/GET /tasks`, `GET/PATCH/DELETE /tasks/{task_id}`, `POST /tasks/{task_id}/complete`, `GET /tasks/{task_id}/history`.
- Medicines: `POST/GET /medicines`, `PATCH/DELETE /medicines/{medicine_id}`, `POST/GET /medicines/{medicine_id}/schedules`, `POST /medicines/{medicine_id}/logs`, `GET /medicines/{medicine_id}/history`, `GET /medicines/history?family_id=...`.
- Medicine status values are `confirmed_taken`, `skipped`, and `not_confirmed`. The API rejects a `not_confirmed` write; no response remains an absent log. `confirmed_taken` is accepted only from the person the medicine is assigned to.

## Assistant, guidance, emergencies, notifications

- `POST /ai/live-token` issues a short-lived Gemini Live token. `POST /ai/tool-execution` validates assistant actions; writes require `confirmed: true` and database authorization.
- `POST /ai/guidance-image` analyzes one caregiver-selected JPEG frame from an active consented guidance session. The image is sent to Gemini only after caregiver confirmation in the app and is not stored.
- `GET /activity?family_id=...` combines recent task and medicine events visible to the authenticated family member.
- Guidance: `POST /guidance/sessions`, `GET /guidance/sessions?family_id=...`, `GET /guidance/sessions/{id}`, `POST /guidance/sessions/{id}/consent`, `/start`, `/decline`, and `/end`.
- Emergency: `POST/GET /emergency`, `GET /emergency/{id}`, `POST /emergency/{id}/notify` to retry delivery, and `POST /emergency/{id}/acknowledge` or `/resolve`.
- Notifications: `POST /notifications/register-device`, `GET /notifications/history`.

Errors use a safe `detail` message; internal provider and database errors are not returned to clients. A notification status is not an acknowledgement: only the caregiver action changes an alert to `acknowledged`.
