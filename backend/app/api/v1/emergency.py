import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.config import get_settings
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import EmergencyCreate, EmergencyMediaUpdate

router = APIRouter(prefix="/emergency", tags=["emergency"])


async def _notify_caregivers(event: dict, db: SupabaseREST) -> dict:
    settings = get_settings()
    if not settings.firebase_credentials_json:
        await db.rpc("record_emergency_notification", {
            "p_event_id": event["id"], "p_recipient_id": event["elderly_user_id"],
            "p_status": "not_configured", "p_provider_message_id": None, "p_error_message": None,
        })
        return {"status": "not_configured", "sent": 0}
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging

        try:
            app = firebase_admin.get_app("saathi")
        except ValueError:
            app = firebase_admin.initialize_app(credentials.Certificate(json.loads(settings.firebase_credentials_json)), name="saathi")
        targets = await db.rpc("emergency_notification_targets", {"p_event_id": event["id"]})
        sent = 0
        targets = targets or []
        for target in targets or []:
            token = target.get("token")
            if not token:
                continue
            try:
                message_id = await __import__("asyncio").to_thread(
                    messaging.send,
                    messaging.Message(
                        token=token,
                        notification=messaging.Notification(title="Saathi emergency alert", body="A family member requested help."),
                        data={"event_id": event["id"], "type": "emergency"},
                    ),
                    app=app,
                )
                status, error = "sent", None
                sent += 1
            except Exception:
                message_id, status, error = None, "failed", "Delivery failed"
            await db.rpc("record_emergency_notification", {
                "p_event_id": event["id"], "p_recipient_id": target["user_id"],
                "p_status": status, "p_provider_message_id": message_id, "p_error_message": error,
            })
        if not targets:
            await db.rpc("record_emergency_notification", {
                "p_event_id": event["id"], "p_recipient_id": event["elderly_user_id"],
                "p_status": "no_registered_devices", "p_provider_message_id": None, "p_error_message": None,
            })
            return {"status": "no_registered_devices", "sent": 0}
        return {"status": "sent" if sent == len(targets) else "partially_sent" if sent else "failed", "sent": sent}
    except Exception:
        try:
            await db.rpc("record_emergency_notification", {
                "p_event_id": event["id"], "p_recipient_id": event["elderly_user_id"],
                "p_status": "failed", "p_provider_message_id": None, "p_error_message": "Delivery service unavailable",
            })
        except Exception:
            pass
        return {"status": "failed", "sent": 0}


@router.post("", status_code=201)
async def create_emergency(payload: EmergencyCreate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    insert_data = {
        "family_id": str(payload.family_id),
        "elderly_user_id": user["id"],
        "message": payload.message,
        "status": "open",
    }
    if payload.front_camera_url is not None:
        insert_data["front_camera_url"] = payload.front_camera_url
    if payload.back_camera_url is not None:
        insert_data["back_camera_url"] = payload.back_camera_url
    if payload.screenshot_url is not None:
        insert_data["screenshot_url"] = payload.screenshot_url

    event = await db.insert("emergency_events", insert_data)
    delivery = await _notify_caregivers(event, db)
    return {"event": event, "notification_delivery": delivery}


@router.patch("/{event_id}/media")
async def update_emergency_media(
    event_id: UUID,
    payload: EmergencyMediaUpdate,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    update_data = {}
    if payload.front_camera_url is not None:
        update_data["front_camera_url"] = payload.front_camera_url
    if payload.back_camera_url is not None:
        update_data["back_camera_url"] = payload.back_camera_url
    if payload.screenshot_url is not None:
        update_data["screenshot_url"] = payload.screenshot_url
    if not update_data:
        return {"status": "no_change"}
    updated = await db.patch("emergency_events", {"id": f"eq.{event_id}"}, update_data)
    return updated


@router.get("")
async def list_emergency(family_id: UUID | None = Query(default=None), db: SupabaseREST = Depends(db_for_user)):
    params = {"order": "created_at.desc"}
    if family_id:
        params["family_id"] = f"eq.{family_id}"
    return await db.select("emergency_events", **params)


@router.get("/{event_id}")
async def get_emergency(event_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("emergency_events", id=f"eq.{event_id}", limit="1")
    return rows[0] if rows else None


@router.post("/{event_id}/notify")
async def retry_emergency_notification(event_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("emergency_events", id=f"eq.{event_id}", limit="1")
    if not rows:
        raise ServiceError(404, "Emergency alert not found")
    if rows[0]["status"] == "resolved":
        raise ServiceError(409, "This emergency alert has already been resolved")
    return await _notify_caregivers(rows[0], db)


@router.post("/{event_id}/acknowledge")
async def acknowledge(event_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("acknowledge_emergency", {"p_event_id": str(event_id)})


@router.post("/{event_id}/resolve")
async def resolve(event_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("resolve_emergency", {"p_event_id": str(event_id)})
