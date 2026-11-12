from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from app.core.errors import ServiceError

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import MedicationCreate, MedicationUpdate, MedicineLogCreate, ScheduleCreate

router = APIRouter(prefix="/medicines", tags=["medicines"])


@router.post("", status_code=201)
async def create_medicine(payload: MedicationCreate, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    return await db.insert("medications", {**payload.model_dump(mode="json"), "created_by": user["id"]})


@router.get("")
async def list_medicines(family_id: UUID | None = Query(default=None), db: SupabaseREST = Depends(db_for_user)):
    filters = {"order": "name.asc"}
    if family_id:
        filters["family_id"] = f"eq.{family_id}"
    return await db.select("medications", **filters)


@router.get("/history")
async def family_medicine_history(family_id: UUID = Query(), db: SupabaseREST = Depends(db_for_user)):
    return await db.select("medication_logs", family_id=f"eq.{family_id}", order="created_at.desc", limit="100")


@router.get("/{medicine_id}")
async def get_medicine(medicine_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    rows = await db.select("medications", id=f"eq.{medicine_id}", limit="1")
    return rows[0] if rows else None


@router.patch("/{medicine_id}")
async def update_medicine(medicine_id: UUID, payload: MedicationUpdate, db: SupabaseREST = Depends(db_for_user)):
    return await db.patch("medications", {"id": f"eq.{medicine_id}"}, payload.model_dump(exclude_unset=True, mode="json"))


@router.delete("/{medicine_id}", status_code=204)
async def delete_medicine(medicine_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    await db.patch("medications", {"id": f"eq.{medicine_id}"}, {"is_active": False})
    return Response(status_code=204)


@router.post("/{medicine_id}/schedules", status_code=201)
async def add_schedule(medicine_id: UUID, payload: ScheduleCreate, db: SupabaseREST = Depends(db_for_user)):
    medicine = await db.select("medications", columns="id,family_id", id=f"eq.{medicine_id}", limit="1")
    if not medicine:
        raise ServiceError(404, "Medicine not found")
    return await db.insert("medication_schedules", {"medication_id": str(medicine_id), "family_id": medicine[0]["family_id"], **payload.model_dump()})


@router.get("/{medicine_id}/schedules")
async def list_schedules(medicine_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.select("medication_schedules", medication_id=f"eq.{medicine_id}", is_active="eq.true", order="scheduled_time.asc")


@router.post("/{medicine_id}/logs", status_code=201)
async def create_medicine_log(medicine_id: UUID, payload: MedicineLogCreate, db: SupabaseREST = Depends(db_for_user)):
    if payload.status == "not_confirmed":
        # A missing response is represented by an absent log, never an inferred dose.
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="A dose can only be logged after an explicit taken or skipped response")
    return await db.rpc("record_medication_status", {
        "p_medication_id": str(medicine_id), "p_status": payload.status,
        "p_scheduled_for": payload.scheduled_for.isoformat() if payload.scheduled_for else None,
        "p_note": payload.note,
    })


@router.get("/{medicine_id}/history")
async def medicine_history(medicine_id: UUID, db: SupabaseREST = Depends(db_for_user)):
    return await db.select("medication_logs", medication_id=f"eq.{medicine_id}", order="created_at.desc")
