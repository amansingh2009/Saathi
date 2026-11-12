import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import (
    BlockRequest,
    ConnectionRequestCreate,
    ReportRequest,
    SeniorProfileUpdate,
)

logger = logging.getLogger("saathi.connections")
router = APIRouter(prefix="/connections", tags=["senior connections"])


@router.get("/discover")
async def discover_seniors(
    query: str | None = Query(default=None),
    language: str | None = Query(default=None),
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Discover other seniors open to connections."""
    user_id = user["id"]

    # 1. Fetch existing connections involving the current user to exclude blocked or determine status
    my_connections = await db.select(
        "senior_connections",
        or_=f"(requester_id.eq.{user_id},recipient_id.eq.{user_id})",
    )

    connection_map: dict[str, dict] = {}
    blocked_user_ids: set[str] = set()

    for conn in my_connections:
        req_id = str(conn.get("requester_id"))
        rec_id = str(conn.get("recipient_id"))
        peer_id = rec_id if req_id == user_id else req_id
        status = conn.get("status")

        if status == "blocked":
            blocked_user_ids.add(peer_id)
        else:
            connection_map[peer_id] = {
                "connection_id": conn["id"],
                "status": "connected" if status == "accepted" else ("pending_sent" if req_id == user_id else "pending_received"),
            }

    # 2. Fetch discoverable profiles
    params: dict[str, str] = {
        "is_discoverable": "eq.true",
        "id": f"neq.{user_id}",
        "limit": "50",
    }
    if language:
        params["preferred_language"] = f"eq.{language}"

    candidates = await db.select(
        "profiles",
        columns="id,full_name,interests,bio,avatar_url,preferred_language",
        **params,
    )

    results = []
    query_lower = query.lower().strip() if query else None

    for profile in candidates:
        pid = str(profile.get("id"))
        if pid in blocked_user_ids:
            continue

        full_name = profile.get("full_name") or "Senior Friend"
        interests = profile.get("interests") or []
        bio = profile.get("bio") or ""

        # Optional client filter matching name, interests or bio
        if query_lower:
            name_match = query_lower in full_name.lower()
            bio_match = query_lower in bio.lower()
            interest_match = any(query_lower in str(item).lower() for item in interests)
            if not (name_match or bio_match or interest_match):
                continue

        conn_info = connection_map.get(pid, {"connection_id": None, "status": "none"})

        results.append({
            "id": pid,
            "full_name": full_name,
            "avatar_url": profile.get("avatar_url"),
            "interests": interests,
            "bio": bio,
            "preferred_language": profile.get("preferred_language") or "en",
            "connection_status": conn_info["status"],
            "connection_id": conn_info["connection_id"],
        })

    return results


@router.get("")
async def list_connections(
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """List all connections and pending requests for the current user."""
    user_id = user["id"]
    conns = await db.select(
        "senior_connections",
        or_=f"(requester_id.eq.{user_id},recipient_id.eq.{user_id})",
        order="created_at.desc",
    )

    peer_ids = []
    for c in conns:
        if c.get("status") != "blocked":
            req_id = str(c["requester_id"])
            peer_ids.append(c["recipient_id"] if req_id == user_id else c["requester_id"])

    profile_map = {}
    if peer_ids:
        # Fetch peer profiles in bulk
        id_filter = f"in.({','.join(str(p) for p in peer_ids)})"
        profiles = await db.select(
            "profiles",
            columns="id,full_name,avatar_url,interests,bio,preferred_language",
            id=id_filter,
        )
        profile_map = {str(p["id"]): p for p in profiles}

    connected = []
    pending_sent = []
    pending_received = []

    for c in conns:
        status = c.get("status")
        if status == "blocked":
            continue

        req_id = str(c["requester_id"])
        is_sender = req_id == user_id
        peer_id = str(c["recipient_id"] if is_sender else c["requester_id"])
        peer_profile = profile_map.get(peer_id, {})

        item = {
            "id": c["id"],
            "peer_id": peer_id,
            "peer_name": peer_profile.get("full_name") or "Friend",
            "peer_avatar": peer_profile.get("avatar_url"),
            "peer_interests": peer_profile.get("interests") or [],
            "peer_bio": peer_profile.get("bio"),
            "peer_language": peer_profile.get("preferred_language") or "en",
            "created_at": c["created_at"],
            "updated_at": c["updated_at"],
        }

        if status == "accepted":
            item["status"] = "connected"
            connected.append(item)
        elif status == "pending":
            if is_sender:
                item["status"] = "pending_sent"
                pending_sent.append(item)
            else:
                item["status"] = "pending_received"
                pending_received.append(item)

    return {
        "connected": connected,
        "pending_sent": pending_sent,
        "pending_received": pending_received,
    }


@router.post("/requests", status_code=201)
async def send_connection_request(
    payload: ConnectionRequestCreate,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Send a connection request to another senior."""
    user_id = user["id"]
    recipient_id = str(payload.recipient_id)

    if recipient_id == user_id:
        raise ServiceError(400, "Cannot connect with yourself")

    # Check for existing connection in either direction
    existing = await db.select(
        "senior_connections",
        or_=f"and(requester_id.eq.{user_id},recipient_id.eq.{recipient_id}),and(requester_id.eq.{recipient_id},recipient_id.eq.{user_id})",
    )

    if existing:
        current = existing[0]
        st = current.get("status")
        if st == "blocked":
            raise ServiceError(403, "Cannot connect with this user")
        if st == "accepted":
            raise ServiceError(400, "Already connected with this user")
        if st == "pending":
            if str(current.get("requester_id")) == user_id:
                raise ServiceError(400, "Connection request already sent")
            # If the other person already sent a request, auto-accept it!
            return await db.patch(
                "senior_connections",
                {"id": f"eq.{current['id']}"},
                {"status": "accepted"},
            )
        # If previously rejected, re-open as pending
        return await db.patch(
            "senior_connections",
            {"id": f"eq.{current['id']}"},
            {"status": "pending", "requester_id": user_id, "recipient_id": recipient_id},
        )

    # Insert new connection request
    row = {
        "requester_id": user_id,
        "recipient_id": recipient_id,
        "status": "pending",
    }
    return await db.insert("senior_connections", row)


@router.post("/requests/{connection_id}/accept")
async def accept_connection_request(
    connection_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Accept an incoming connection request."""
    user_id = user["id"]
    rows = await db.select(
        "senior_connections",
        id=f"eq.{connection_id}",
        recipient_id=f"eq.{user_id}",
        status="eq.pending",
    )
    if not rows:
        raise ServiceError(404, "Pending connection request not found")

    return await db.patch(
        "senior_connections",
        {"id": f"eq.{connection_id}"},
        {"status": "accepted"},
    )


@router.post("/requests/{connection_id}/reject")
async def reject_connection_request(
    connection_id: UUID,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Reject an incoming connection request."""
    user_id = user["id"]
    rows = await db.select(
        "senior_connections",
        id=f"eq.{connection_id}",
        recipient_id=f"eq.{user_id}",
    )
    if not rows:
        raise ServiceError(404, "Connection request not found")

    return await db.patch(
        "senior_connections",
        {"id": f"eq.{connection_id}"},
        {"status": "rejected"},
    )


@router.post("/block")
async def block_user(
    payload: BlockRequest,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Block a user from contacting or calling."""
    user_id = user["id"]
    target_id = str(payload.user_id)

    if target_id == user_id:
        raise ServiceError(400, "Cannot block yourself")

    existing = await db.select(
        "senior_connections",
        or_=f"and(requester_id.eq.{user_id},recipient_id.eq.{target_id}),and(requester_id.eq.{target_id},recipient_id.eq.{user_id})",
    )

    if existing:
        current = existing[0]
        return await db.patch(
            "senior_connections",
            {"id": f"eq.{current['id']}"},
            {"status": "blocked", "blocked_by": user_id},
        )

    # Insert blocked record
    return await db.insert(
        "senior_connections",
        {
            "requester_id": user_id,
            "recipient_id": target_id,
            "status": "blocked",
            "blocked_by": user_id,
        },
    )


@router.post("/report", status_code=201)
async def report_user(
    payload: ReportRequest,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Report a user for inappropriate behavior and automatically block them."""
    user_id = user["id"]
    target_id = str(payload.user_id)

    if target_id == user_id:
        raise ServiceError(400, "Cannot report yourself")

    # 1. Log report
    report = await db.insert(
        "senior_reports",
        {
            "reporter_id": user_id,
            "reported_id": target_id,
            "reason": payload.reason.strip(),
        },
    )

    # 2. Automatically block the user
    try:
        await block_user(BlockRequest(user_id=payload.user_id), user, db)
    except Exception as exc:
        logger.warning("Could not auto-block reported user %s: %s", target_id, exc)

    return report


@router.patch("/profile")
async def update_senior_profile(
    payload: SeniorProfileUpdate,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Update senior profile discovery and interests."""
    user_id = user["id"]
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise ServiceError(400, "No fields to update")

    rows = await db.select("profiles", id=f"eq.{user_id}", limit="1")
    if not rows:
        row = {"id": user_id, "email": user.get("email"), **values}
        return await db.insert("profiles", row)

    return await db.patch("profiles", {"id": f"eq.{user_id}"}, values)

