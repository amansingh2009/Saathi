from datetime import datetime, timezone
import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import CallCreate, CallTokenResponse, InstantCallCreate
from app.services.livekit_service import generate_livekit_token, get_livekit_url

logger = logging.getLogger("saathi.calls")
router = APIRouter(prefix="/calls", tags=["calls"])


async def _verify_mutual_consent(db: SupabaseREST, user_id: str, peer_id: str) -> None:
    """Verify that both users are connected with mutual consent and not blocked."""
    conns = await db.select(
        "senior_connections",
        or_=f"and(requester_id.eq.{user_id},recipient_id.eq.{peer_id}),and(requester_id.eq.{peer_id},recipient_id.eq.{user_id})",
    )
    if not conns:
        raise ServiceError(403, "You can only call accepted senior connections.")

    status = conns[0].get("status")
    if status == "blocked":
        raise ServiceError(403, "Communication with this user is blocked.")
    if status != "accepted":
        raise ServiceError(403, "Mutual connection consent is required before calling.")


@router.post("", status_code=201)
async def create_call(
    payload: CallCreate,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Initiate a 1-on-1 audio or video call to a connected senior."""
    user_id = user["id"]
    receiver_id = str(payload.receiver_id)

    if receiver_id == user_id:
        raise ServiceError(400, "Cannot call yourself")

    # 1. Verify mutual consent and non-blocked status
    await _verify_mutual_consent(db, user_id, receiver_id)

    # 2. Check for existing active ringing calls between this pair; clean up or mark missed
    existing_ringing = await db.select(
        "calls",
        status="eq.ringing",
        or_=f"and(caller_id.eq.{user_id},receiver_id.eq.{receiver_id}),and(caller_id.eq.{receiver_id},receiver_id.eq.{user_id})",
    )
    for stale_call in existing_ringing:
        try:
            await db.patch(
                "calls",
                {"id": f"eq.{stale_call['id']}"},
                {"status": "missed", "ended_at": datetime.now(timezone.utc).isoformat()},
            )
        except Exception:
            pass

    # 3. Generate unique room name and insert call record
    room_name = f"saathi_{uuid4().hex}"
    call_record = await db.insert(
        "calls",
        {
            "caller_id": user_id,
            "receiver_id": receiver_id,
            "call_type": payload.call_type,
            "status": "ringing",
            "room_name": room_name,
        },
    )

    # 4. Fetch caller profile name for room participant display
    caller_profiles = await db.select("profiles", id=f"eq.{user_id}", columns="full_name", limit="1")
    caller_name = caller_profiles[0].get("full_name") if caller_profiles else "Caller"

    # 5. Generate LiveKit token for the caller
    token = generate_livekit_token(
        user_id=user_id,
        user_name=caller_name,
        room_name=room_name,
    )

    return {
        "call": call_record,
        "token": token,
        "room_name": room_name,
        "livekit_url": get_livekit_url(),
    }


@router.post("/instant")
async def create_instant_room(
    payload: InstantCallCreate = InstantCallCreate(),
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Create or join an instant conference room by name or auto-generated room name."""
    room_name = (payload.room_name.strip() if payload.room_name else "") or f"conf_{uuid4().hex[:8]}"
    profiles = await db.select("profiles", id=f"eq.{user['id']}", columns="full_name", limit="1")
    user_name = profiles[0].get("full_name") if profiles else "Senior Friend"
    token = generate_livekit_token(
        user_id=user["id"],
        user_name=user_name,
        room_name=room_name,
    )
    return {
        "room_name": room_name,
        "token": token,
        "livekit_url": get_livekit_url(),
        "call_type": payload.call_type,
    }


@router.post("/{call_id}/accept", response_model=CallTokenResponse)
async def accept_call(
    call_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Accept an incoming call (receiver only) and return LiveKit connection token."""
    user_id = user["id"]
    calls = await db.select("calls", id=f"eq.{call_id}")
    if not calls:
        raise ServiceError(404, "Call not found")

    call = calls[0]
    if str(call["receiver_id"]) != user_id:
        raise ServiceError(403, "Only the called receiver can accept this call")

    if call["status"] in ("rejected", "ended", "missed"):
        raise ServiceError(400, f"Cannot accept call with status '{call['status']}'")

    # Update call status to accepted
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.patch(
        "calls",
        {"id": f"eq.{call_id}"},
        {"status": "accepted", "answered_at": now_iso},
    )

    # Fetch receiver profile name
    receiver_profiles = await db.select("profiles", id=f"eq.{user_id}", columns="full_name", limit="1")
    receiver_name = receiver_profiles[0].get("full_name") if receiver_profiles else "Receiver"

    token = generate_livekit_token(
        user_id=user_id,
        user_name=receiver_name,
        room_name=call["room_name"],
    )

    return CallTokenResponse(
        token=token,
        room_name=call["room_name"],
        livekit_url=get_livekit_url(),
        call_id=call["id"],
    )


@router.post("/{call_id}/reject")
async def reject_call(
    call_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Reject an incoming call or cancel an outgoing ringing call."""
    user_id = user["id"]
    calls = await db.select("calls", id=f"eq.{call_id}")
    if not calls:
        raise ServiceError(404, "Call not found")

    call = calls[0]
    is_caller = str(call["caller_id"]) == user_id
    is_receiver = str(call["receiver_id"]) == user_id

    if not (is_caller or is_receiver):
        raise ServiceError(403, "Not authorized for this call")

    new_status = "missed" if is_caller else "rejected"
    now_iso = datetime.now(timezone.utc).isoformat()

    return await db.patch(
        "calls",
        {"id": f"eq.{call_id}"},
        {"status": new_status, "ended_at": now_iso},
    )


@router.post("/{call_id}/end")
async def end_call(
    call_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """End an active call."""
    user_id = user["id"]
    calls = await db.select("calls", id=f"eq.{call_id}")
    if not calls:
        raise ServiceError(404, "Call not found")

    call = calls[0]
    if str(call["caller_id"]) != user_id and str(call["receiver_id"]) != user_id:
        raise ServiceError(403, "Not authorized to end this call")

    now_iso = datetime.now(timezone.utc).isoformat()
    return await db.patch(
        "calls",
        {"id": f"eq.{call_id}"},
        {"status": "ended", "ended_at": now_iso},
    )


@router.post("/{call_id}/token", response_model=CallTokenResponse)
async def get_call_token(
    call_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Retrieve or refresh LiveKit access token for an active call participant."""
    user_id = user["id"]
    calls = await db.select("calls", id=f"eq.{call_id}")
    if not calls:
        raise ServiceError(404, "Call not found")

    call = calls[0]
    caller_id = str(call["caller_id"])
    receiver_id = str(call["receiver_id"])

    if user_id not in (caller_id, receiver_id):
        raise ServiceError(403, "Not a participant in this call")

    if call["status"] in ("rejected", "ended", "missed"):
        raise ServiceError(400, f"Call is already {call['status']}")

    peer_id = receiver_id if user_id == caller_id else caller_id
    await _verify_mutual_consent(db, user_id, peer_id)

    profiles = await db.select("profiles", id=f"eq.{user_id}", columns="full_name", limit="1")
    user_name = profiles[0].get("full_name") if profiles else "User"

    token = generate_livekit_token(
        user_id=user_id,
        user_name=user_name,
        room_name=call["room_name"],
    )

    return CallTokenResponse(
        token=token,
        room_name=call["room_name"],
        livekit_url=get_livekit_url(),
        call_id=call["id"],
    )


@router.get("/history")
async def call_history(
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Retrieve call history for the current user."""
    user_id = user["id"]
    calls = await db.select(
        "calls",
        or_=f"caller_id.eq.{user_id},receiver_id.eq.{user_id}",
        order="created_at.desc",
        limit="50",
    )

    peer_ids = set()
    for c in calls:
        peer_ids.add(c["receiver_id"] if str(c["caller_id"]) == user_id else c["caller_id"])

    profile_map = {}
    if peer_ids:
        id_filter = f"in.({','.join(str(p) for p in peer_ids)})"
        profiles = await db.select(
            "profiles",
            columns="id,full_name,avatar_url",
            id=id_filter,
        )
        profile_map = {str(p["id"]): p for p in profiles}

    enriched = []
    for c in calls:
        is_caller = str(c["caller_id"]) == user_id
        peer_id = str(c["receiver_id"] if is_caller else c["caller_id"])
        peer_profile = profile_map.get(peer_id, {})

        enriched.append({
            "id": c["id"],
            "peer_id": peer_id,
            "peer_name": peer_profile.get("full_name") or "Friend",
            "peer_avatar": peer_profile.get("avatar_url"),
            "call_type": c["call_type"],
            "direction": "outgoing" if is_caller else "incoming",
            "status": c["status"],
            "created_at": c["created_at"],
            "answered_at": c.get("answered_at"),
            "ended_at": c.get("ended_at"),
        })

    return enriched

