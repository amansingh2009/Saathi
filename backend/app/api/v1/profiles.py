from fastapi import APIRouter, Depends

from app.api.deps import db_for_user
from app.core.supabase_rest import SupabaseREST
from app.core.auth import current_user
from app.schemas.common import ProfileUpdate

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me")
async def read_profile(user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("profiles", id=f"eq.{user['id']}", limit="1")
    return rows[0] if rows else {"id": user["id"], "email": user.get("email"), "profile_ready": False}


@router.patch("/me")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    values = payload.model_dump(exclude_unset=True)
    rows = await db.select("profiles", id=f"eq.{user['id']}", limit="1")
    if not rows:
        row = {"id": user["id"], "email": user.get("email"), **values}
        return await db.insert("profiles", row)
    return await db.patch("profiles", {"id": f"eq.{user['id']}"}, values)
