from fastapi.testclient import TestClient
import pytest

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.main import app

USER_ID = "4c49b770-5e69-4dbc-b8e1-073e17265067"
FAMILY_ID = "e52291e8-df2c-4e18-9ff3-2a16746f8d2f"
ELDER_ID = "9c00bb32-1e37-45ab-b92f-ae18b4fb6524"


class FakeDatabase:
    def __init__(self):
        self.inserted = []
        self.rpc_calls = []

    async def insert(self, table, row):
        self.inserted.append((table, row))
        return {"id": "bfb56289-49d0-41ea-899c-f3da171485b7", **row}

    async def rpc(self, name, args):
        self.rpc_calls.append((name, args))
        return {"status": "ok"}


def client_with(db):
    app.dependency_overrides[current_user] = lambda: {"id": USER_ID, "access_token": "test-token"}
    app.dependency_overrides[db_for_user] = lambda: db
    return TestClient(app)


def test_health_is_available():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_missing_bearer_token_is_rejected():
    with TestClient(app) as client:
        response = client.get("/api/v1/profiles/me")
    assert response.status_code == 401


def test_task_creation_uses_verified_user_as_assigner():
    db = FakeDatabase()
    with client_with(db) as client:
        response = client.post("/api/v1/tasks", json={
            "family_id": FAMILY_ID, "title": "Call the clinic", "assigned_to": ELDER_ID,
        })
    app.dependency_overrides.clear()
    assert response.status_code == 201
    assert db.inserted[0][0] == "tasks"
    assert db.inserted[0][1]["assigned_by"] == USER_ID


def test_medicine_not_confirmed_does_not_write_a_log():
    db = FakeDatabase()
    with client_with(db) as client:
        response = client.post(
            "/api/v1/medicines/1e50b450-707d-469f-a92d-bde4e10aaeb4/logs",
            json={"status": "not_confirmed"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 422
    assert db.rpc_calls == []


def test_medicine_taken_status_uses_atomic_database_function():
    db = FakeDatabase()
    medicine_id = "1e50b450-707d-469f-a92d-bde4e10aaeb4"
    with client_with(db) as client:
        response = client.post(f"/api/v1/medicines/{medicine_id}/logs", json={"status": "confirmed_taken"})
    app.dependency_overrides.clear()
    assert response.status_code == 201
    assert db.rpc_calls[0] == ("record_medication_status", {
        "p_medication_id": medicine_id, "p_status": "confirmed_taken", "p_scheduled_for": None, "p_note": None,
    })


def test_shared_activity_combines_task_and_medicine_events():
    class ActivityDatabase:
        async def select(self, table, **kwargs):
            if table == "tasks": return [{"id": "task-1", "title": "Morning walk"}]
            if table == "task_logs": return [{"id": "log-1", "task_id": "task-1", "action": "completed", "user_id": USER_ID, "created_at": "2026-11-12T09:00:00Z"}]
            if table == "medication_logs": return [{"id": "log-2", "medication_id": "med-1", "status": "skipped", "user_id": USER_ID, "created_at": "2026-11-12T10:00:00Z"}]
            if table == "medications": return [{"id": "med-1", "name": "Vitamin D"}]
            return []

    with client_with(ActivityDatabase()) as client:
        response = client.get(f"/api/v1/activity?family_id={FAMILY_ID}")
    app.dependency_overrides.clear()
    assert response.status_code == 200
    events = response.json()
    assert [event["kind"] for event in events] == ["medicine", "task"]
    assert events[0]["title"] == "Vitamin D"
    assert events[0]["detail"] == "Marked skipped"


@pytest.mark.asyncio
async def test_guidance_image_rejects_non_session_caregiver_before_ai_call(monkeypatch):
    from types import SimpleNamespace
    from uuid import UUID
    from app.api.v1 import ai
    from app.core.errors import ServiceError
    from app.schemas.common import GuidanceImageAnalysis

    class SessionDatabase:
        async def select(self, table, **kwargs):
            return [{"id": str(UUID("c19c8d88-46f7-4b73-95a3-df4d11192331")), "caregiver_user_id": ELDER_ID, "status": "active"}]

    monkeypatch.setattr(ai, "get_settings", lambda: SimpleNamespace(gemini_api_key="configured", gemini_screen_model="gemini-test"))
    payload = GuidanceImageAnalysis(session_id="c19c8d88-46f7-4b73-95a3-df4d11192331", image_base64="A" * 120, question="What should I tap?")
    with pytest.raises(ServiceError) as error:
        await ai.analyze_guidance_image(payload, {"id": USER_ID}, SessionDatabase())
    assert error.value.status_code == 403
