"""API feature tests with an in-memory Supabase REST substitute.

These tests exercise API validation, payload shaping, confirmation gates, and RPC routing.
They do not replace live-project RLS or Android/device integration tests.
"""

import hashlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.main import app

USER_ID = "4c49b770-5e69-4dbc-b8e1-073e17265067"
PEER_ID = "9c00bb32-1e37-45ab-b92f-ae18b4fb6524"
FAMILY_ID = "e52291e8-df2c-4e18-9ff3-2a16746f8d2f"
TASK_ID = "b36b6d7d-e219-4c4b-9ab7-e59a50f041f9"
MED_ID = "1e50b450-707d-469f-a92d-bde4e10aaeb4"
SESSION_ID = "c19c8d88-46f7-4b73-95a3-df4d11192331"
EVENT_ID = "9000c572-6d5b-4a48-9e91-d23b2e0ff160"


class MemoryDB:
    def __init__(self, tables=None):
        self.tables = tables or {}
        self.select_calls = []
        self.inserts = []
        self.patches = []
        self.deletes = []
        self.rpcs = []

    async def select(self, table, **params):
        self.select_calls.append((table, params))
        rows = self.tables.get(table, [])
        columns = params.get("columns")
        if columns and columns != "*":
            selected = set(columns.split(","))
            return [{key: value for key, value in row.items() if key in selected} for row in rows]
        return rows

    async def insert(self, table, row):
        inserted = {"id": EVENT_ID if table == "emergency_events" else SESSION_ID, **row}
        self.inserts.append((table, inserted))
        return inserted

    async def patch(self, table, filters, values):
        self.patches.append((table, filters, values))
        return {"id": TASK_ID, **values}

    async def delete(self, table, filters):
        self.deletes.append((table, filters))

    async def rpc(self, name, args):
        self.rpcs.append((name, args))
        return {"ok": True, **args}


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def api_client(db, user_id=USER_ID):
    app.dependency_overrides[current_user] = lambda: {"id": user_id, "email": "user@example.test", "access_token": "test-token"}
    app.dependency_overrides[db_for_user] = lambda: db
    return TestClient(app)


def test_profile_patch_creates_profile_for_authenticated_user():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.patch("/api/v1/profiles/me", json={"full_name": "Asha", "preferred_language": "hi"})
    assert response.status_code == 200
    table, row = db.inserts[0]
    assert table == "profiles"
    assert row["id"] == USER_ID
    assert row["preferred_language"] == "hi"


def test_profile_rejects_unsupported_language():
    with api_client(MemoryDB()) as client:
        response = client.patch("/api/v1/profiles/me", json={"preferred_language": "fr"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_authentication_uses_supabase_verified_user_not_client_claims(monkeypatch):
    from fastapi.security import HTTPAuthorizationCredentials
    from app.core import auth

    observed = {}

    class FakeAuthClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return None
        async def get(self, url, headers):
            observed.update(url=url, headers=headers)
            return SimpleNamespace(status_code=200, json=lambda: {"id": USER_ID, "email": "verified@example.test"})

    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(supabase_url="https://project.supabase.co", supabase_publishable_key="publishable"))
    monkeypatch.setattr(auth.httpx, "AsyncClient", lambda **_kwargs: FakeAuthClient())
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-user-token")
    result = await auth.current_user(credentials)
    assert result["id"] == USER_ID
    assert result["access_token"] == "signed-user-token"
    assert observed["url"].endswith("/auth/v1/user")
    assert observed["headers"]["Authorization"] == "Bearer signed-user-token"


@pytest.mark.asyncio
async def test_authentication_rejects_expired_or_invalid_supabase_token(monkeypatch):
    from fastapi.security import HTTPAuthorizationCredentials
    from app.core import auth
    from app.core.errors import ServiceError

    class FakeAuthClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return None
        async def get(self, *_args, **_kwargs): return SimpleNamespace(status_code=401, json=lambda: {})

    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(supabase_url="https://project.supabase.co", supabase_publishable_key="publishable"))
    monkeypatch.setattr(auth.httpx, "AsyncClient", lambda **_kwargs: FakeAuthClient())
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired-token")
    with pytest.raises(ServiceError) as error:
        await auth.current_user(credentials)
    assert error.value.status_code == 401


def test_family_creation_uses_authenticated_creator():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/families", json={"name": "Sharma family"})
    assert response.status_code == 201
    assert db.inserts[0][0] == "families"
    assert db.inserts[0][1]["created_by"] == USER_ID


def test_family_invitation_returns_raw_token_but_stores_only_hash():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post(f"/api/v1/families/{FAMILY_ID}/invite", json={"role": "elderly", "expires_in_hours": 24})
    assert response.status_code == 201
    raw_token = response.json()["invite_token"]
    stored = db.inserts[0][1]
    assert stored["token_hash"] == hashlib.sha256(raw_token.encode()).hexdigest()
    assert raw_token not in str(stored)


def test_invitation_acceptance_hashes_submitted_token_before_rpc():
    token = "valid-invitation-token"
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/invitations/accept", json={"token": token})
    assert response.status_code == 201
    assert db.rpcs == [("accept_family_invitation", {"p_token_hash": hashlib.sha256(token.encode()).hexdigest()})]


def test_family_member_response_does_not_request_or_return_email():
    db = MemoryDB({
        "family_members": [{"id": "member-1", "family_id": FAMILY_ID, "user_id": PEER_ID, "role": "elderly", "status": "active"}],
        "profiles": [{"id": PEER_ID, "full_name": "Asha", "phone": "+910000000000", "preferred_language": "ta", "email": "private@example.test"}],
    })
    with api_client(db) as client:
        response = client.get(f"/api/v1/families/{FAMILY_ID}/members")
    assert response.status_code == 200
    assert response.json()[0]["profile"] == {"id": PEER_ID, "full_name": "Asha", "phone": "+910000000000", "preferred_language": "ta"}
    profile_query = next(params for table, params in db.select_calls if table == "profiles")
    assert "email" not in profile_query["columns"]


def test_task_completion_uses_atomic_rpc():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post(f"/api/v1/tasks/{TASK_ID}/complete")
    assert response.status_code == 200
    assert db.rpcs == [("complete_task", {"p_task_id": TASK_ID})]


def test_medicine_schedule_family_id_comes_from_authorized_medicine():
    db = MemoryDB({"medications": [{"id": MED_ID, "family_id": FAMILY_ID}]})
    with api_client(db) as client:
        response = client.post(f"/api/v1/medicines/{MED_ID}/schedules", json={"scheduled_time": "08:30", "days_of_week": [0, 2, 4]})
    assert response.status_code == 201
    table, row = db.inserts[0]
    assert table == "medication_schedules"
    assert row["family_id"] == FAMILY_ID
    assert row["medication_id"] == MED_ID


def test_medicine_skipped_response_is_logged_with_distinct_status():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post(f"/api/v1/medicines/{MED_ID}/logs", json={"status": "skipped"})
    assert response.status_code == 201
    assert db.rpcs[0][0] == "record_medication_status"
    assert db.rpcs[0][1]["p_status"] == "skipped"


def test_medicine_schedule_rejects_invalid_clock_time():
    db = MemoryDB({"medications": [{"id": MED_ID, "family_id": FAMILY_ID}]})
    with api_client(db) as client:
        response = client.post(f"/api/v1/medicines/{MED_ID}/schedules", json={"scheduled_time": "25:12", "days_of_week": [0]})
    assert response.status_code == 422
    assert not db.inserts


def test_guidance_request_is_created_for_current_caregiver():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/guidance/sessions", json={"family_id": FAMILY_ID, "elderly_user_id": PEER_ID, "reason": "Help with settings"})
    assert response.status_code == 201
    row = db.inserts[0][1]
    assert row["caregiver_user_id"] == USER_ID
    assert row["status"] == "requested"


@pytest.mark.parametrize(("action", "rpc"), [("consent", "consent_to_guidance_session"), ("start", "start_guidance_session"), ("decline", "decline_guidance_session"), ("end", "end_guidance_session")])
def test_guidance_lifecycle_routes_to_guarded_database_functions(action, rpc):
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post(f"/api/v1/guidance/sessions/{SESSION_ID}/{action}")
    assert response.status_code == 200
    assert db.rpcs == [(rpc, {"p_session_id": SESSION_ID})]


def test_sos_creates_open_event_and_reports_unconfigured_push(monkeypatch):
    from app.api.v1 import emergency
    monkeypatch.setattr(emergency, "get_settings", lambda: SimpleNamespace(firebase_credentials_json=None))
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/emergency", json={"family_id": FAMILY_ID, "message": "Need help"})
    assert response.status_code == 201
    assert response.json()["event"]["status"] == "open"
    assert response.json()["notification_delivery"] == {"status": "not_configured", "sent": 0}
    assert db.rpcs[0][0] == "record_emergency_notification"


@pytest.mark.parametrize(("action", "rpc"), [("acknowledge", "acknowledge_emergency"), ("resolve", "resolve_emergency")])
def test_emergency_lifecycle_routes_to_guarded_database_functions(action, rpc):
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post(f"/api/v1/emergency/{EVENT_ID}/{action}")
    assert response.status_code == 200
    assert db.rpcs == [(rpc, {"p_event_id": EVENT_ID})]


def test_resolved_emergency_cannot_retry_push(monkeypatch):
    from app.api.v1 import emergency
    monkeypatch.setattr(emergency, "get_settings", lambda: SimpleNamespace(firebase_credentials_json=None))
    db = MemoryDB({"emergency_events": [{"id": EVENT_ID, "status": "resolved"}]})
    with api_client(db) as client:
        response = client.post(f"/api/v1/emergency/{EVENT_ID}/notify")
    assert response.status_code == 409
    assert db.rpcs == []


def test_device_registration_binds_token_to_authenticated_user():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/notifications/register-device", json={"family_id": FAMILY_ID, "token": "device-token-that-is-long-enough", "platform": "android"})
    assert response.status_code == 201
    table, row = db.inserts[0]
    assert table == "device_tokens"
    assert row["user_id"] == USER_ID


def test_assistant_requires_confirmation_before_mutating_task_data():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/ai/tool-execution", json={"name": "create_task", "arguments": {"family_id": FAMILY_ID, "title": "Call the clinic", "assigned_to": PEER_ID}, "confirmed": False})
    assert response.status_code == 409
    assert not db.inserts


def test_confirmed_assistant_task_uses_authenticated_assigner():
    db = MemoryDB()
    with api_client(db) as client:
        response = client.post("/api/v1/ai/tool-execution", json={"name": "create_task", "arguments": {"family_id": FAMILY_ID, "title": "Call the clinic", "assigned_to": PEER_ID}, "confirmed": True})
    assert response.status_code == 200
    assert db.inserts[0][1]["assigned_by"] == USER_ID


def test_get_medicine_history_returns_formatted_records():
    db = MemoryDB(
        tables={
            "medications": [{"id": MED_ID, "name": "Metformin", "dosage": "500mg"}],
            "medication_logs": [
                {
                    "medication_id": MED_ID,
                    "status": "taken",
                    "scheduled_for": "09:00",
                    "created_at": "2026-11-12T04:30:00Z",
                    "note": "Taken after breakfast",
                }
            ],
        }
    )
    with api_client(db) as client:
        response = client.post(
            "/api/v1/ai/tool-execution",
            json={
                "name": "get_medicine_history",
                "arguments": {
                    "family_id": FAMILY_ID,
                    "start_date": "2026-11-10",
                    "end_date": "2026-11-13",
                    "timezone": "Asia/Kolkata",
                },
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data["records"]) == 1
    record = data["records"][0]
    assert record["medicine"] == "Metformin"
    assert record["dosage"] == "500mg"
    assert record["status"] == "taken"
    assert record["note"] == "Taken after breakfast"


def test_get_medicine_history_validates_dates():
    db = MemoryDB()
    with api_client(db) as client:
        # End date before start date
        response = client.post(
            "/api/v1/ai/tool-execution",
            json={
                "name": "get_medicine_history",
                "arguments": {
                    "family_id": FAMILY_ID,
                    "start_date": "2026-11-15",
                    "end_date": "2026-11-10",
                },
            },
        )
    assert response.status_code == 422
    assert "on or after" in response.json()["detail"].lower()



def test_live_voice_token_fails_clearly_when_gemini_is_not_configured(monkeypatch):
    from app.api.v1 import ai
    monkeypatch.setattr(ai, "get_settings", lambda: SimpleNamespace(gemini_api_key=None))
    with api_client(MemoryDB()) as client:
        response = client.post("/api/v1/ai/live-token")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()


def test_live_voice_token_enables_transcription_and_interruptions(monkeypatch):
    from app.api.v1 import ai

    observed = {}
    class FakeTokens:
        def create(self, *, config):
            observed["config"] = config
            return SimpleNamespace(name="ephemeral-test-token", expire_time="soon")

    class FakeClient:
        def __init__(self, **kwargs):
            observed["client"] = kwargs
            self.auth_tokens = FakeTokens()

    async def run_inline(function, **kwargs):
        return function(**kwargs)

    monkeypatch.setattr(ai, "get_settings", lambda: SimpleNamespace(gemini_api_key="configured", gemini_live_model="gemini-3.8-live"))
    monkeypatch.setattr(ai, "run_in_threadpool", run_inline)
    monkeypatch.setattr("google.genai.Client", FakeClient)
    with api_client(MemoryDB()) as client:
        response = client.post("/api/v1/ai/live-token")

    config = observed["config"].live_connect_constraints.config
    assert response.status_code == 200
    assert response.json()["token"] == "ephemeral-test-token"
    assert config.input_audio_transcription is not None
    assert config.output_audio_transcription is not None
    assert config.realtime_input_config.activity_handling == "START_OF_ACTIVITY_INTERRUPTS"
    assert observed["config"].live_connect_constraints.model == "gemini-3.8-live"


def test_text_chat_returns_gemini_reply_for_authenticated_user(monkeypatch):
    from app.api.v1 import ai

    class FakeModels:
        def generate_content(self, **_kwargs):
            return SimpleNamespace(text="Hello! How can I help?", function_calls=[], candidates=[])

    class FakeClient:
        def __init__(self, **_kwargs):
            self.models = FakeModels()

    async def run_inline(function, **kwargs):
        return function(**kwargs)

    monkeypatch.setattr(ai, "get_settings", lambda: SimpleNamespace(gemini_api_key="configured", gemini_text_model="gemini-3.8-flash"))
    monkeypatch.setattr(ai, "run_in_threadpool", run_inline)
    monkeypatch.setattr("google.genai.Client", FakeClient)
    with api_client(MemoryDB()) as client:
        response = client.post("/api/v1/ai/chat", json={"messages": [{"role": "user", "content": "Hello Saathi"}]})

    assert response.status_code == 200
    assert response.json()["reply"] == "Hello! How can I help?"


@pytest.mark.asyncio
async def test_guidance_image_returns_ai_advice_only_for_active_session(monkeypatch):
    from app.api.v1 import ai
    from app.schemas.common import GuidanceImageAnalysis

    async def fake_threadpool(function, **kwargs):
        return SimpleNamespace(text="Tap the blue Continue button.")

    monkeypatch.setattr(ai, "get_settings", lambda: SimpleNamespace(gemini_api_key="configured", gemini_screen_model="model"))
    monkeypatch.setattr(ai, "run_in_threadpool", fake_threadpool)
    monkeypatch.setattr("google.genai.Client", lambda **kwargs: SimpleNamespace(models=SimpleNamespace(generate_content=lambda **args: None)))
    db = MemoryDB({"screen_sessions": [{"id": SESSION_ID, "caregiver_user_id": USER_ID, "status": "active"}]})
    payload = GuidanceImageAnalysis(session_id=SESSION_ID, image_base64="/9j/" + "A" * 132, question="What should I tap?")
    result = await ai.analyze_guidance_image(payload, {"id": USER_ID}, db)
    assert result["guidance"] == "Tap the blue Continue button."


def test_new_connection_request_is_pending_and_bound_to_current_user():
    db = MemoryDB({"senior_connections": []})
    with api_client(db) as client:
        response = client.post("/api/v1/connections/requests", json={"recipient_id": PEER_ID})
    assert response.status_code == 201
    table, row = db.inserts[0]
    assert table == "senior_connections"
    assert row["requester_id"] == USER_ID
    assert row["status"] == "pending"
