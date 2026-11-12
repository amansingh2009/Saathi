from datetime import datetime, timezone
from fastapi.testclient import TestClient
import pytest

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.main import app
from app.services.livekit_service import generate_livekit_token

USER_A = "4c49b770-5e69-4dbc-b8e1-073e17265067"
USER_B = "9c00bb32-1e37-45ab-b92f-ae18b4fb6524"
CALL_ID = "11111111-2222-3333-4444-555555555555"
CONN_ID = "66666666-7777-8888-9999-000000000000"


class FakeCallsDatabase:
    def __init__(self, connections=None, calls=None, profiles=None):
        self.connections = list(connections or [])
        self.calls = list(calls or [])
        self.profiles = list(profiles or [])
        self.inserted = []
        self.patched = []

    async def select(self, table, **params):
        if table == "senior_connections":
            return self.connections
        if table == "calls":
            return self.calls
        if table == "profiles":
            return self.profiles
        return []

    async def insert(self, table, row):
        new_row = {"id": CALL_ID if table == "calls" else CONN_ID, **row}
        self.inserted.append((table, new_row))
        if table == "calls":
            self.calls.append(new_row)
        return new_row

    async def patch(self, table, filters, values):
        self.patched.append((table, filters, values))
        if table == "calls" and self.calls:
            self.calls[0].update(values)
            return self.calls[0]
        if table == "senior_connections" and self.connections:
            self.connections[0].update(values)
            return self.connections[0]
        return values


def client_for(user_id, db):
    app.dependency_overrides[current_user] = lambda: {"id": user_id, "access_token": "test-token"}
    app.dependency_overrides[db_for_user] = lambda: db
    return TestClient(app)


def test_livekit_token_generation():
    token = generate_livekit_token(
        user_id="user-123",
        user_name="Elderly Alice",
        room_name="test-room-456",
    )
    assert isinstance(token, str)
    assert len(token) > 50


def test_cannot_call_self():
    db = FakeCallsDatabase()
    with client_for(USER_A, db) as client:
        res = client.post("/api/v1/calls", json={"receiver_id": USER_A, "call_type": "video"})
    app.dependency_overrides.clear()
    assert res.status_code == 400
    assert "Cannot call yourself" in res.json()["detail"]


def test_cannot_call_unconnected_senior():
    # No accepted connection in database
    db = FakeCallsDatabase(connections=[])
    with client_for(USER_A, db) as client:
        res = client.post("/api/v1/calls", json={"receiver_id": USER_B, "call_type": "video"})
    app.dependency_overrides.clear()
    assert res.status_code == 403
    assert "accepted senior connections" in res.json()["detail"]


def test_cannot_call_blocked_senior():
    db = FakeCallsDatabase(connections=[
        {"id": CONN_ID, "requester_id": USER_A, "recipient_id": USER_B, "status": "blocked"}
    ])
    with client_for(USER_A, db) as client:
        res = client.post("/api/v1/calls", json={"receiver_id": USER_B, "call_type": "audio"})
    app.dependency_overrides.clear()
    assert res.status_code == 403
    assert "blocked" in res.json()["detail"].lower()


def test_initiate_call_success_returns_livekit_token():
    db = FakeCallsDatabase(
        connections=[{"id": CONN_ID, "requester_id": USER_A, "recipient_id": USER_B, "status": "accepted"}],
        profiles=[{"id": USER_A, "full_name": "Ramesh Uncle"}]
    )
    with client_for(USER_A, db) as client:
        res = client.post("/api/v1/calls", json={"receiver_id": USER_B, "call_type": "video"})
    app.dependency_overrides.clear()
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert "room_name" in data
    assert data["room_name"].startswith("saathi_")
    assert data["call"]["caller_id"] == USER_A
    assert data["call"]["receiver_id"] == USER_B
    assert data["call"]["call_type"] == "video"


def test_accept_call_by_receiver():
    db = FakeCallsDatabase(
        calls=[{
            "id": CALL_ID,
            "caller_id": USER_A,
            "receiver_id": USER_B,
            "status": "ringing",
            "room_name": "saathi_test_room",
            "call_type": "audio",
        }],
        profiles=[{"id": USER_B, "full_name": "Shanti Devi"}]
    )
    with client_for(USER_B, db) as client:
        res = client.post(f"/api/v1/calls/{CALL_ID}/accept")
    app.dependency_overrides.clear()
    assert res.status_code == 200
    data = res.json()
    assert data["call_id"] == CALL_ID
    assert data["room_name"] == "saathi_test_room"
    assert "token" in data
    # Ensure call status was patched to accepted
    assert any(p[0] == "calls" and p[2].get("status") == "accepted" for p in db.patched)


def test_accept_call_unauthorized_user_forbidden():
    third_user = "33333333-3333-3333-3333-333333333333"
    db = FakeCallsDatabase(
        calls=[{
            "id": CALL_ID,
            "caller_id": USER_A,
            "receiver_id": USER_B,
            "status": "ringing",
            "room_name": "saathi_test_room",
            "call_type": "audio",
        }]
    )
    with client_for(third_user, db) as client:
        res = client.post(f"/api/v1/calls/{CALL_ID}/accept")
    app.dependency_overrides.clear()
    assert res.status_code == 403


def test_end_call():
    db = FakeCallsDatabase(
        calls=[{
            "id": CALL_ID,
            "caller_id": USER_A,
            "receiver_id": USER_B,
            "status": "accepted",
            "room_name": "saathi_test_room",
            "call_type": "video",
        }]
    )
    with client_for(USER_A, db) as client:
        res = client.post(f"/api/v1/calls/{CALL_ID}/end")
    app.dependency_overrides.clear()
    assert res.status_code == 200
    assert any(p[0] == "calls" and p[2].get("status") == "ended" for p in db.patched)


def test_discover_seniors():
    db = FakeCallsDatabase(
        connections=[],
        profiles=[
            {"id": USER_B, "full_name": "Priya Sharma", "interests": ["Gardening", "Yoga"], "bio": "Senior resident", "preferred_language": "hi"}
        ]
    )
    with client_for(USER_A, db) as client:
        res = client.get("/api/v1/connections/discover")
    app.dependency_overrides.clear()
    assert res.status_code == 200
    discovered = res.json()
    assert len(discovered) == 1
    assert discovered[0]["id"] == USER_B
    assert discovered[0]["full_name"] == "Priya Sharma"
    assert discovered[0]["connection_status"] == "none"


def test_instant_call_room_creation():
    db = FakeCallsDatabase(
        profiles=[{"id": USER_A, "full_name": "Ramesh Uncle"}]
    )
    with client_for(USER_A, db) as client:
        res = client.post("/api/v1/calls/instant", json={"room_name": "hackathon-room-1", "call_type": "video"})
    app.dependency_overrides.clear()
    assert res.status_code == 200
    data = res.json()
    assert data["room_name"] == "hackathon-room-1"
    assert data["call_type"] == "video"
    assert "token" in data
    assert len(data["token"]) > 50


