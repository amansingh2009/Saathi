import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import FamilyCreate, FamilyInvite, InvitationAccept

router = APIRouter(tags=["families"])


@router.post("/families", status_code=201)
async def create_family(payload: FamilyCreate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    family = await db.insert("families", {"name": payload.name, "created_by": user["id"]})
    if payload.role:
        try:
            await db.patch("family_members", {"family_id": f"eq.{family['id']}", "user_id": f"eq.{user['id']}"}, {"role": payload.role})
        except Exception:
            pass
    return family


@router.get("/families")
async def list_families(db: SupabaseREST = Depends(db_for_user)):
    return await db.select("families", order="created_at.asc")


@router.get("/families/{family_id}")
async def get_family(family_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("families", id=f"eq.{family_id}", limit="1")
    if not rows:
        raise ServiceError(404, "Family not found")
    return rows[0]


INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def generate_invite_code(length: int = 6) -> str:
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(length))


@router.post("/families/{family_id}/invite", status_code=201)
async def invite_member(family_id: UUID, payload: FamilyInvite, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    token = generate_invite_code(6)
    expires_at = datetime.now(UTC) + timedelta(hours=payload.expires_in_hours)
    invite = await db.insert("invitations", {
        "family_id": str(family_id), "email": payload.email, "role": payload.role,
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "invited_by": user["id"], "expires_at": expires_at.isoformat(),
    })
    return {"id": invite.get("id"), "family_id": str(family_id), "role": payload.role,
            "invite_token": token, "expires_at": expires_at}


@router.post("/invitations/accept", status_code=201)
async def accept_invitation(payload: InvitationAccept, db: SupabaseREST = Depends(db_for_user)):
    raw_token = payload.token.strip()
    token = raw_token.upper() if len(raw_token) == 6 else raw_token
    result = await db.rpc("accept_family_invitation", {"p_token_hash": hashlib.sha256(token.encode()).hexdigest()})
    return result


@router.get("/families/{family_id}/members")
async def family_members(family_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    members = await db.select("family_members", family_id=f"eq.{family_id}", status="eq.active", order="joined_at.asc")
    profiles = {}
    for member in members:
        rows = await db.select("profiles", columns="id,full_name,phone,preferred_language", id=f"eq.{member['user_id']}", limit="1")
        if rows:
            profiles[member["user_id"]] = rows[0]
    return [{**member, "profile": profiles.get(member["user_id"])} for member in members]
