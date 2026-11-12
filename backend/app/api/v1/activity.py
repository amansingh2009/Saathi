import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import db_for_user
from app.core.supabase_rest import SupabaseREST

router = APIRouter(prefix="/activity", tags=["family activity"])


@router.get("")
async def family_activity(family_id: UUID = Query(), db: SupabaseREST = Depends(db_for_user)):
    """Return the latest shared task and medicine events visible under the caller's RLS token."""
    family_filter = f"eq.{family_id}"
    tasks, task_logs, medicine_logs, medicines = await asyncio.gather(
        db.select("tasks", columns="id,title,status,family_id", family_id=family_filter),
        db.select("task_logs", columns="id,task_id,user_id,action,note,created_at", family_id=family_filter, order="created_at.desc", limit="100"),
        db.select("medication_logs", columns="id,medication_id,user_id,status,note,scheduled_for,created_at", family_id=family_filter, order="created_at.desc", limit="100"),
        db.select("medications", columns="id,name,family_id", family_id=family_filter),
    )
    task_titles = {row["id"]: row["title"] for row in tasks}
    medicine_names = {row["id"]: row["name"] for row in medicines}
    events = [
        {"id": row["id"], "kind": "task", "title": task_titles.get(row["task_id"], "Family task"),
         "detail": "Completed" if row["action"] == "completed" else "Reopened", "user_id": row["user_id"], "created_at": row["created_at"]}
        for row in task_logs
    ] + [
        {"id": row["id"], "kind": "medicine", "title": medicine_names.get(row["medication_id"], "Medicine"),
         "detail": {"confirmed_taken": "Reported taken", "skipped": "Marked skipped", "not_confirmed": "Not confirmed"}.get(row["status"], "Updated"),
         "user_id": row["user_id"], "created_at": row["created_at"]}
        for row in medicine_logs
    ]
    return sorted(events, key=lambda row: row["created_at"], reverse=True)[:100]
