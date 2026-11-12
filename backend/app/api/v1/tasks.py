from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", status_code=201)
async def create_task(payload: TaskCreate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    return await db.insert("tasks", {**payload.model_dump(mode="json"), "assigned_by": user["id"]})


@router.get("")
async def list_tasks(family_id: UUID | None = Query(default=None), db: SupabaseREST = Depends(db_for_user)):
    filters = {"order": "due_at.asc.nullslast,created_at.desc"}
    if family_id:
        filters["family_id"] = f"eq.{family_id}"
    return await db.select("tasks", **filters)


@router.get("/{task_id}")
async def get_task(task_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("tasks", id=f"eq.{task_id}", limit="1")
    return rows[0] if rows else None


@router.patch("/{task_id}")
async def update_task(task_id: UUID, payload: TaskUpdate, db: SupabaseREST = Depends(db_for_user)):
    return await db.patch("tasks", {"id": f"eq.{task_id}"}, payload.model_dump(exclude_unset=True, mode="json"))


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    await db.delete("tasks", {"id": f"eq.{task_id}"})
    return Response(status_code=204)


@router.post("/{task_id}/complete")
async def complete_task(task_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.rpc("complete_task", {"p_task_id": str(task_id)})


@router.get("/{task_id}/history")
async def task_history(task_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.select("task_logs", task_id=f"eq.{task_id}", order="created_at.desc")
