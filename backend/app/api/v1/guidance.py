from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi import Query
from uuid import UUID

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import GuidanceCreate

router = APIRouter(prefix="/guidance", tags=["screen guidance"])


@router.post("/sessions", status_code=201)
async def create_session(payload: GuidanceCreate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    return await db.insert("screen_sessions", {**payload.model_dump(mode="json"), "caregiver_user_id": user["id"], "status": "requested"})


@router.post("/sessions/{session_id}/consent")
async def grant_consent(session_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("consent_to_guidance_session", {"p_session_id": str(session_id)})


@router.get("/sessions/{session_id}")
async def get_session(session_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("screen_sessions", id=f"eq.{session_id}", limit="1")
    return rows[0] if rows else None


@router.get("/sessions")
async def list_sessions(family_id: UUID = Query(), db: SupabaseREST = Depends(db_for_user)):
    return await db.select("screen_sessions", family_id=f"eq.{family_id}", order="created_at.desc", limit="50")


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("start_guidance_session", {"p_session_id": str(session_id)})


@router.post("/sessions/{session_id}/decline")
async def decline_session(session_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("decline_guidance_session", {"p_session_id": str(session_id)})


@router.post("/sessions/{session_id}/end")
async def end_session(session_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("end_guidance_session", {"p_session_id": str(session_id)})
