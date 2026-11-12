from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    preferred_language: Literal["en", "hi", "ta"] | None = None
    phone: str | None = Field(default=None, max_length=32)


class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FamilyInvite(BaseModel):
    role: Literal["elderly", "caregiver"]
    email: str | None = Field(default=None, max_length=254)
    expires_in_hours: int = Field(default=72, ge=1, le=168)


class InvitationAccept(BaseModel):
    token: str = Field(min_length=6, max_length=256)


class TaskCreate(BaseModel):
    family_id: UUID
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    assigned_to: UUID
    due_at: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    assigned_to: UUID | None = None
    due_at: datetime | None = None


class MedicationCreate(BaseModel):
    family_id: UUID
    elderly_user_id: UUID
    name: str = Field(min_length=1, max_length=160)
    dosage: str | None = Field(default=None, max_length=160)
    instructions: str | None = Field(default=None, max_length=1000)


class MedicationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    dosage: str | None = Field(default=None, max_length=160)
    instructions: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class ScheduleCreate(BaseModel):
    scheduled_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    days_of_week: list[int] = Field(min_length=1, max_length=7)
    timezone: str = Field(default="Asia/Kolkata", max_length=64)


class MedicineLogCreate(BaseModel):
    status: Literal["confirmed_taken", "skipped", "not_confirmed"]
    scheduled_for: datetime | None = None
    note: str | None = Field(default=None, max_length=500)


class GuidanceCreate(BaseModel):
    family_id: UUID
    elderly_user_id: UUID
    reason: str | None = Field(default=None, max_length=500)


class EmergencyCreate(BaseModel):
    family_id: UUID
    message: str | None = Field(default=None, max_length=500)


class DeviceRegistration(BaseModel):
    family_id: UUID
    token: str = Field(min_length=20, max_length=4096)
    platform: Literal["android", "ios"]


class AIToolExecution(BaseModel):
    name: Literal[
        "get_task_summary", "get_medicine_summary", "get_medicine_history", "create_task",
        "complete_task", "confirm_medicine_taken", "get_family_contacts",
    ]
    arguments: dict
    confirmed: bool = False


class AIChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=4000)


class AIChatRequest(BaseModel):
    messages: list[AIChatMessage] = Field(min_length=1, max_length=24)
    family_id: UUID | None = None


class GuidanceImageAnalysis(BaseModel):
    session_id: UUID
    image_base64: str = Field(min_length=100, max_length=2_000_000)
    question: str = Field(min_length=3, max_length=300)


class SeniorProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    interests: list[str] | None = None
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=2048)
    is_discoverable: bool | None = None
    preferred_language: Literal["en", "hi", "ta"] | None = None


class ConnectionRequestCreate(BaseModel):
    recipient_id: UUID


class BlockRequest(BaseModel):
    user_id: UUID


class ReportRequest(BaseModel):
    user_id: UUID
    reason: str = Field(min_length=3, max_length=1000)


class CallCreate(BaseModel):
    receiver_id: UUID
    call_type: Literal["audio", "video"]


class InstantCallCreate(BaseModel):
    room_name: str | None = None
    call_type: Literal["audio", "video"] = "video"


class CallTokenResponse(BaseModel):
    token: str
    room_name: str
    livekit_url: str
    call_id: UUID


