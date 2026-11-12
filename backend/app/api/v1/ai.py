import base64
import binascii
from datetime import UTC, date, datetime, time, timedelta
import logging
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from app.api.deps import db_for_user
from app.core.auth import current_user
from app.core.config import get_settings
from app.core.errors import ServiceError
from app.core.supabase_rest import SupabaseREST
from app.schemas.common import AIChatRequest, AIToolExecution, GuidanceImageAnalysis, TaskCreate

logger = logging.getLogger("saathi.ai")
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
    {"name": "get_medicine_history", "description": "Read the signed-in user's recorded medicine responses for an inclusive date range. Dates are YYYY-MM-DD; timezone defaults to Asia/Kolkata.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}, "start_date": {"type": "STRING"}, "end_date": {"type": "STRING"}, "timezone": {"type": "STRING"}}, "required": ["family_id", "start_date", "end_date", "timezone"]}},
    {"name": "get_family_contacts", "description": "Read the signed-in user's family contacts.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]}},
    {"name": "create_task", "description": "Create a family task only after the user confirms.", "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}, "title": {"type": "STRING"}, "assigned_to": {"type": "STRING"}, "description": {"type": "STRING"}}, "required": ["family_id", "title", "assigned_to"]}},
    {"name": "complete_task", "description": "Complete a family task only after the user confirms.", "parameters": {"type": "OBJECT", "properties": {"task_id": {"type": "STRING"}}, "required": ["task_id"]}},
    {"name": "confirm_medicine_taken", "description": "Record a dose as taken only after the user explicitly confirms they took it.", "parameters": {"type": "OBJECT", "properties": {"medicine_id": {"type": "STRING"}, "scheduled_for": {"type": "STRING"}}, "required": ["medicine_id"]}},
]}]
for declaration in LIVE_TOOLS[0]["function_declarations"]:
    declaration["behavior"] = "BLOCKING"

TEXT_READ_TOOLS = [
    {
        "name": "get_task_summary",
        "description": "Read tasks for the active family.",
        "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]},
    },
    {
        "name": "get_medicine_summary",
        "description": "Read the current medicines and schedules for the active family.",
        "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]},
    },
    {
        "name": "get_medicine_history",
        "description": "Read the signed-in senior's recorded medicine responses for an inclusive date range. Use YYYY-MM-DD dates and Asia/Kolkata timezone.",
        "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}, "start_date": {"type": "STRING"}, "end_date": {"type": "STRING"}, "timezone": {"type": "STRING"}}, "required": ["family_id", "start_date", "end_date", "timezone"]},
    },
    {
        "name": "get_family_contacts",
        "description": "Read the people connected to the active family.",
        "parameters": {"type": "OBJECT", "properties": {"family_id": {"type": "STRING"}}, "required": ["family_id"]},
    },
]


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


@router.post("/chat")
async def text_chat(
    payload: AIChatRequest,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Generate a text reply and allow only read-only, RLS-scoped family lookups."""
    if payload.messages[-1].role != "user":
        raise ServiceError(422, "Send a message before asking Saathi to reply")
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ServiceError(503, "The AI companion is not configured on the server")
    try:
        from google import genai
        from google.genai import types

        today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
        family_instruction = (
            f"The active family id is {payload.family_id}. Use it only with read-only family tools."
            if payload.family_id
            else "The user has not connected a family. If asked about family tasks or medicines, say that family information is unavailable until they join a family."
        )
        instruction = (
            "You are Saathi, a warm, calm assistant for older adults. Reply in simple language and the user's language. "
            "Keep answers short, clear, and helpful. Do not ask for passwords, OTPs, PINs, or banking details. "
            "Never change medication dosage or claim a dose was taken without a recorded confirmation. "
            "For task, medicine schedule, medicine history, or family questions, use the corresponding read-only tool; "
            "ask a brief follow-up when a medicine-history date range is unclear. Text chat cannot make changes. "
            f"Today is {today} in Asia/Kolkata. {family_instruction}"
        )
        contents = [
            types.Content(role=message.role, parts=[types.Part.from_text(text=message.content)])
            for message in payload.messages
        ]
        tool = types.Tool(function_declarations=TEXT_READ_TOOLS) if payload.family_id else None
        config = types.GenerateContentConfig(
            system_instruction=instruction,
            tools=[tool] if tool else None,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            max_output_tokens=600,
            temperature=0.3,
        )
        client = genai.Client(api_key=settings.gemini_api_key)
        active_model = settings.gemini_text_model
        fallback_model = getattr(settings, "gemini_text_fallback_model", "gemini-flash-lite-latest")

        async def generate_reply():
            nonlocal active_model
            model_choices = list(dict.fromkeys((
                active_model,
                settings.gemini_text_model,
                fallback_model,
                "gemini-3.1-flash-lite",
                "gemini-flash-lite-latest",
                "gemini-3-flash-preview",
                "gemini-3.5-flash-lite",
            )))
            for index, model_name in enumerate(model_choices):
                try:
                    result = await run_in_threadpool(
                        client.models.generate_content,
                        model=model_name,
                        contents=contents,
                        config=config,
                    )
                    active_model = model_name
                    return result
                except Exception as exc:
                    status_code = getattr(exc, "status_code", None)
                    exc_str = str(exc).lower()
                    is_transient = (
                        status_code in {429, 500, 502, 503, 504}
                        or "503" in exc_str
                        or "429" in exc_str
                        or "high demand" in exc_str
                        or "timeout" in exc_str
                        or "overloaded" in exc_str
                        or "resource exhausted" in exc_str
                        or "unavailable" in exc_str
                    )
                    logger.warning("Gemini text chat model %s failed (transient=%s): %s", model_name, is_transient, exc)
                    if not is_transient or index == len(model_choices) - 1:
                        if index == len(model_choices) - 1:
                            raise ServiceError(502, "Saathi could not reply right now. Please try again.") from exc
                        raise
            raise ServiceError(502, "Saathi could not reply right now. Please try again.")

        response = await generate_reply()
        for _ in range(3):
            calls = response.function_calls or []
            if not calls:
                break
            candidate = response.candidates[0] if response.candidates else None
            if not candidate or not candidate.content:
                break
            contents.append(candidate.content)
            function_responses = []
            for call in calls:
                if call.name not in {"get_task_summary", "get_medicine_summary", "get_medicine_history", "get_family_contacts"}:
                    result = {"error": "This action is not available in text chat."}
                else:
                    try:
                        result = await execute_tool(
                            AIToolExecution(name=call.name, arguments=call.args or {}),
                            user=user,
                            db=db,
                        )
                    except Exception:
                        result = {"error": "I couldn't load that information. Please try again."}
                function_responses.append(
                    types.Part.from_function_response(
                        name=call.name,
                        response={"result": result},
                    )
                )
            contents.append(types.Content(role="user", parts=function_responses))
            response = await generate_reply()
        answer = (response.text or "I couldn't prepare a reply. Please try asking another way.").strip()
        return {"reply": answer[:6000], "model": active_model}
    except ServiceError:
        raise
    except Exception as exc:
        logger.exception("Text chat failed: %s", exc)
        raise ServiceError(502, "Saathi could not reply right now. Please try again.") from exc


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
    if payload.name == "get_medicine_history":
        try:
            family_id = UUID(str(args["family_id"]))
            start_date = date.fromisoformat(str(args["start_date"]))
            end_date = date.fromisoformat(str(args["end_date"]))
            timezone_name = str(args.get("timezone") or "Asia/Kolkata")
            timezone = ZoneInfo(timezone_name)
        except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError) as exc:
            raise ServiceError(422, "Choose a valid medicine history date range") from exc
        if end_date < start_date:
            raise ServiceError(422, "The end date must be on or after the start date")
        if (end_date - start_date).days > 365:
            raise ServiceError(422, "Choose a date range of one year or less")
        start_at = datetime.combine(start_date, time.min, tzinfo=timezone).astimezone(UTC)
        end_before = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone).astimezone(UTC)
        logs = []
        page_size = 500
        for offset in range(0, 5_500, page_size):
            page = await db.select(
                "medication_logs",
                columns="medication_id,status,scheduled_for,created_at,note",
                family_id=f"eq.{family_id}",
                user_id=f"eq.{user['id']}",
                **{"and": f"(created_at.gte.{start_at.isoformat()},created_at.lt.{end_before.isoformat()})"},
                order="created_at.asc",
                limit=str(page_size),
                offset=str(offset),
            )
            logs.extend(page)
            if len(page) < page_size:
                break
        if len(logs) > 5_000:
            raise ServiceError(422, "That date range has too many records. Please choose a shorter range.")
        medicines = await db.select("medications", columns="id,name,dosage", family_id=f"eq.{family_id}")
        medicine_by_id = {medicine["id"]: medicine for medicine in medicines}
        records = [
            {
                "medicine": medicine_by_id.get(row["medication_id"], {}).get("name", "Medicine"),
                "dosage": medicine_by_id.get(row["medication_id"], {}).get("dosage"),
                "status": row["status"],
                "scheduled_for": row.get("scheduled_for"),
                "recorded_at": row.get("created_at"),
                "note": row.get("note"),
            }
            for row in logs
            if row.get("medication_id") in medicine_by_id
        ]
        return {"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "timezone": timezone_name, "records": records}
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
