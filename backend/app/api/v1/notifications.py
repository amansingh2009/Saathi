from fastapi import APIRouter, Depends

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import DeviceRegistration
from app.core.errors import ServiceError

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/register-device", status_code=201)
async def register_device(payload: DeviceRegistration, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    data = {
        "family_id": str(payload.family_id), "user_id": user["id"],
        "token": payload.token, "platform": payload.platform,
    }
    try:
        return await db.insert("device_tokens", data)
    except ServiceError as error:
        if error.status_code != 409:
            raise
        return await db.patch("device_tokens", {"token": f"eq.{payload.token}"}, {"family_id": str(payload.family_id), "platform": payload.platform})


@router.get("/history")
async def notification_history(db: SupabaseREST = Depends(db_for_user)):
    return await db.select("notification_logs", order="created_at.desc", limit="100")
