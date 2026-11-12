from datetime import UTC, datetime, timedelta
import base64
import binascii

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.config import get_settings
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import AIToolExecution, GuidanceImageAnalysis, TaskCreate

router = APIRouter(prefix="/ai", tags=["ai assistant"])
SYSTEM_INSTRUCTION = (
    "You are Saathi, a calm, kind voice companion for older adults. Speak simply, "
    "use one short instruction at a time, support English, Hindi, and Tamil, and "
    "never request passwords, OTPs, PINs, or banking credentials. Do not change "
    "medicine dosage. Confirm before changing tasks or recording medicine."
)
LIVE_TOOLS = [{"function_declarations": [
    {"name": "get_task_summary", "description": "Read the signed-in family member's tasks.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]}},
    {"name": "get_medicine_summary", "description": "Read the family's current medicine schedule.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]}},
    {"name": "get_family_contacts", "description": "Read the signed-in user's family contacts.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]}},
    {"name": "create_task", "description": "Create a family task only after the user confirms.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}, "title": {"type": "STRING"}, "assigned_to": {"type": "STRING"}, "description": {"type": "STRING"}}, "required": ["family_id", "title", "assigned_to"]}},
    {"name": "complete_task", "description": "Complete a family task only after the user confirms.", "parameters": {"type": "OBJECT", "properties": {"task_id": {"type": "STRING"}}, "required": ["task_id"]}},
    {"name": "confirm_medicine_taken", "description": "Record a dose as taken only after the user explicitly confirms they took it.", "parameters": {"type": "OBJECT", "properties": {"medicine_id": {"type": "STRING"}, "scheduled_for": {"type": "STRING"}}, "required": ["medicine_id"]}},
]}]
for declaration in LIVE_TOOLS[0]["function_declarations"]:
    declaration["behavior"] = "BLOCKING"


@router.post("/live-token")
async def live_token(_: dict = Depends(current_user)):
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ServiceError(503, "Voice assistant is not configured on the server")
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key, http_options={"api_version": "v1alpha"})
        now = datetime.now(UTC)
        config = types.CreateAuthTokenConfig(
            uses=1,
            expire_time=now + timedelta(minutes=15),
            new_session_expire_time=now + timedelta(minutes=5),
            live_connect_constraints=types.LiveConnectConstraints(
                model=settings.gemini_live_model,
                config=types.LiveConnectConfig(
                    response_modalities=["AUDIO"],
                    system_instruction=SYSTEM_INSTRUCTION,
                    tools=LIVE_TOOLS,
                    input_audio_transcription=types.AudioTranscriptionConfig(),
                    output_audio_transcription=types.AudioTranscriptionConfig(),
                    realtime_input_config=types.RealtimeInputConfig(
                        activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
                    ),
                ),
            ),
        )
        token = await run_in_threadpool(client.auth_tokens.create, config=config)
    except Exception as exc:
        raise ServiceError(502, "Could not start the voice assistant") from exc
    token_value = getattr(token, "name", None) or getattr(token, "token", None)
    if not token_value:
        raise ServiceError(502, "Could not start the voice assistant")
    return {"token": token_value, "model": settings.gemini_live_model, "expires_at": getattr(token, "expire_time", None)}


@router.post("/tool-execution")
async def execute_tool(payload: AIToolExecution, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    args = payload.arguments
    mutating = payload.name in {"create_task", "complete_task", "confirm_medicine_taken"}
    if mutating and not payload.confirmed:
        raise ServiceError(409, "The user must confirm this change before it can be executed")
    if payload.name == "get_task_summary":
        params = {"order": "due_at.asc.nullslast"}
        if args.get("family_id"):
            params["family_id"] = f"eq.{args['family_id']}"
        return {"tasks": await db.select("tasks", **params)}
    if payload.name == "get_medicine_summary":
        params = {"order": "name.asc", "is_active": "eq.true"}
        if args.get("family_id"):
            params["family_id"] = f"eq.{args['family_id']}"
        medicines = await db.select("medications", **params)
        for medicine in medicines:
            medicine["schedules"] = await db.select(
                "medication_schedules", medication_id=f"eq.{medicine['id']}", is_active="eq.true", order="scheduled_time.asc"
            )
        return {"medicines": medicines}
    if payload.name == "get_family_contacts":
        if not args.get("family_id"):
            raise ServiceError(422, "family_id is required")
        members = await db.select("family_members", family_id=f"eq.{args['family_id']}", status="eq.active")
        contacts = []
        for member in members:
            profiles = await db.select("profiles", columns="id,full_name,phone", id=f"eq.{member['user_id']}", limit="1")
            contacts.append({**member, "profile": profiles[0] if profiles else None})
        return {"contacts": contacts}
    if payload.name == "create_task":
        data = TaskCreate.model_validate(args)
        task = await db.insert("tasks", {**data.model_dump(mode="json"), "assigned_by": user["id"]})
        return {"result": "created", "task": task}
    if payload.name == "complete_task":
        return {"result": "completed", "log": await db.rpc("complete_task", {"p_task_id": str(args["task_id"])})}
    if payload.name == "confirm_medicine_taken":
        result = await db.rpc("record_medication_status", {
            "p_medication_id": str(args["medicine_id"]), "p_status": "confirmed_taken",
            "p_scheduled_for": args.get("scheduled_for"), "p_note": None,
        })
        return {"result": "confirmed", "log": result}
    raise ServiceError(422, "Unsupported assistant action")


@router.post("/guidance-image")
async def analyze_guidance_image(payload: GuidanceImageAnalysis, user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
    """Analyze one frame only after the caregiver explicitly asks during an active consented session."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ServiceError(503, "Screen guidance is not configured on the server")
    sessions = await db.select(
        "screen_sessions", columns="id,caregiver_user_id,status",
        id=f"eq.{payload.session_id}", status="eq.active", limit="1",
    )
    if not sessions or sessions[0].get("caregiver_user_id") != user["id"]:
        raise ServiceError(403, "This guidance session is not available")
    try:
        image_bytes = base64.b64decode(payload.image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ServiceError(422, "The screen image is invalid") from exc
    if not image_bytes.startswith(b"\xff\xd8\xff") or len(image_bytes) > 1_500_000:
        raise ServiceError(422, "Use a JPEG screen image smaller than 1.5 MB")
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        response = await run_in_threadpool(
            client.models.generate_content,
            model=settings.gemini_screen_model,
            contents=[
                "You are Saathi, helping an older adult navigate a phone. Describe only what is visible and give one short, safe next step. Never repeat passwords, OTPs, PINs, banking details, or other sensitive text. If the screen is unclear or sensitive, say so and ask the caregiver to guide them verbally.",
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                f"Caregiver question: {payload.question}",
            ],
            config=types.GenerateContentConfig(max_output_tokens=180, temperature=0.2),
        )
        answer = (response.text or "I can’t read this screen clearly. Please guide your family member verbally.").strip()
    except Exception as exc:
        raise ServiceError(502, "Screen guidance could not analyze this image") from exc
    return {"guidance": answer[:1200]}
