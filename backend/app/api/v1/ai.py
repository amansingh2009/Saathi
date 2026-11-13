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
    "never request passwords, OTPs, PINs, or banking credentials. Never ask the user "
    "for a family code or family ID; all family information is handled automatically. "
    "Do not change medicine dosage. Confirm before changing tasks or recording medicine."
)
AI_COMPANION_TOOLS = [
    {
        "name": "get_task_summary",
        "description": "Read tasks for the active family. Do not ask user for family ID.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"family_id": {"type": "STRING", "description": "Optional active family ID. Automatically resolved by system."}},
        },
    },
    {
        "name": "create_task",
        "description": "Create a new task for the senior or family member.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "title": {"type": "STRING", "description": "Title or summary of the task"},
                "description": {"type": "STRING", "description": "Optional notes or details"},
                "due_at": {"type": "STRING", "description": "Optional ISO datetime when task is due (e.g. 2026-11-13T17:00:00Z)"},
                "family_id": {"type": "STRING", "description": "Optional family ID. Automatically resolved by system."},
                "assigned_to": {"type": "STRING", "description": "Optional user ID of assignee"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark an existing task as completed by task ID or title.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "task_id": {"type": "STRING", "description": "UUID of the task to complete"},
                "title": {"type": "STRING", "description": "Title or keyword of the task if ID is unknown"},
            },
        },
    },
    {
        "name": "get_medicine_summary",
        "description": "Read current medications and scheduled reminder times for the active family. Do not ask user for family ID.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"family_id": {"type": "STRING", "description": "Optional active family ID. Automatically resolved by system."}},
        },
    },
    {
        "name": "create_medicine",
        "description": "Add a new medication and optionally schedule daily or weekly reminder times.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING", "description": "Name of the medicine (e.g. Paracetamol, Metformin)"},
                "dosage": {"type": "STRING", "description": "Dosage (e.g. 500mg, 1 tablet)"},
                "instructions": {"type": "STRING", "description": "Directions (e.g. After lunch, With warm water)"},
                "scheduled_time": {"type": "STRING", "description": "Time in HH:MM 24-hr format (e.g. 08:30 or 20:00)"},
                "days_of_week": {
                    "type": "ARRAY",
                    "items": {"type": "INTEGER"},
                    "description": "Days of week from 0 (Sunday) to 6 (Saturday). Defaults to all 7 days [0, 1, 2, 3, 4, 5, 6].",
                },
                "family_id": {"type": "STRING", "description": "Optional family ID. Automatically resolved by system."},
            },
            "required": ["name"],
        },
    },
    {
        "name": "confirm_medicine_taken",
        "description": "Record that the senior has taken their medication dose.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "medicine_id": {"type": "STRING", "description": "UUID of the medicine if known"},
                "medicine_name": {"type": "STRING", "description": "Name of the medicine if UUID is not known"},
                "scheduled_for": {"type": "STRING", "description": "Optional scheduled time string"},
                "note": {"type": "STRING", "description": "Optional note"},
            },
        },
    },
    {
        "name": "record_medicine_skipped",
        "description": "Record that a scheduled dose was skipped, along with an optional reason.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "medicine_id": {"type": "STRING", "description": "UUID of the medicine if known"},
                "medicine_name": {"type": "STRING", "description": "Name of the medicine if UUID is not known"},
                "scheduled_for": {"type": "STRING", "description": "Optional scheduled time string"},
                "note": {"type": "STRING", "description": "Reason for skipping (e.g. felt nauseous, doctor advised)"},
            },
        },
    },
    {
        "name": "get_medicine_history",
        "description": "Read the senior's recorded taken/skipped medicine logs for an inclusive date range (YYYY-MM-DD). Do not ask user for family ID.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "family_id": {"type": "STRING", "description": "Optional active family ID. Automatically resolved by system."},
                "start_date": {"type": "STRING", "description": "Start date in YYYY-MM-DD format"},
                "end_date": {"type": "STRING", "description": "End date in YYYY-MM-DD format"},
                "timezone": {"type": "STRING", "description": "Timezone, defaults to Asia/Kolkata"},
            },
            "required": ["start_date", "end_date", "timezone"],
        },
    },
    {
        "name": "get_family_contacts",
        "description": "Read the people connected to the active family. Do not ask user for family ID.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"family_id": {"type": "STRING", "description": "Optional active family ID. Automatically resolved by system."}},
        },
    },
    {
        "name": "update_user_interests",
        "description": "Save personal interests, hobbies, family details, or memories to build long-term personalization.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "interests": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "List of hobbies or interests (e.g. ['bhajans', 'gardening', 'cricket'])",
                },
                "bio": {"type": "STRING", "description": "Personal background, family members, or life notes to remember"},
            },
        },
    },
]

LIVE_TOOLS = [{"function_declarations": [dict(t, behavior="BLOCKING") for t in AI_COMPANION_TOOLS]}]


@router.post("/live-token")
async def live_token(user: dict = Depends(current_user), db: SupabaseREST = Depends(db_for_user)):
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
    fam_id = None
    try:
        fam_id = await _resolve_family_id({}, user["id"], db)
    except Exception:
        pass
    return {
        "token": token_value,
        "model": settings.gemini_live_model,
        "expires_at": getattr(token, "expire_time", None),
        "family_id": fam_id,
        "user_id": user["id"],
    }


async def _resolve_family_id(args: dict, user_id: str, db: SupabaseREST) -> str:
    fam_id = args.get("family_id")
    if fam_id:
        return str(fam_id)
    try:
        memberships = await db.select(
            "family_members",
            columns="family_id",
            user_id=f"eq.{user_id}",
            status="eq.active",
            limit="1",
        )
        if memberships and memberships[0].get("family_id"):
            return str(memberships[0]["family_id"])
    except Exception:
        pass
    try:
        families = await db.select(
            "families",
            columns="id",
            created_by=f"eq.{user_id}",
            limit="1",
        )
        if families and families[0].get("id"):
            return str(families[0]["id"])
    except Exception:
        pass
    raise ServiceError(422, "Please connect to a family group first.")


@router.post("/chat")
async def text_chat(
    payload: AIChatRequest,
    user: dict = Depends(current_user),
    db: SupabaseREST = Depends(db_for_user),
):
    """Generate a personalized text reply with full access to manage tasks and medicines."""
    if payload.messages[-1].role != "user":
        raise ServiceError(422, "Send a message before asking Saathi to reply")
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ServiceError(503, "The AI companion is not configured on the server")
    try:
        from google import genai
        from google.genai import types

        # 1. Fetch user profile for personalization
        profile_rows = await db.select(
            "profiles",
            columns="full_name,preferred_language,interests,bio",
            id=f"eq.{user['id']}",
            limit="1",
        )
        user_profile = profile_rows[0] if profile_rows else {}
        user_name = user_profile.get("full_name") or "Friend"
        preferred_lang = user_profile.get("preferred_language") or "en"
        interests = user_profile.get("interests") or []
        bio = user_profile.get("bio") or ""

        interests_str = ", ".join(interests) if interests else "Not yet specified"
        profile_snippet = (
            f"User Profile: Name: {user_name}. Preferred language: {preferred_lang}. "
            f"Known interests & hobbies: {interests_str}. Personal notes: {bio or 'None'}. "
        )

        today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
        active_fam_id = str(payload.family_id) if payload.family_id else None
        if not active_fam_id:
            try:
                active_fam_id = await _resolve_family_id({}, user["id"], db)
            except Exception:
                active_fam_id = None

        family_instruction = (
            f"The active family id is {active_fam_id}. Always use this family ID for all tools. NEVER ask the senior or user for a family id, family code, or invite code."
            if active_fam_id
            else "The user has not connected a family group yet. If asked about family tasks or medicines, guide them to connect from the Home screen."
        )
        instruction = (
            "You are Saathi, a warm, caring, respectful, and attentive companion for older adults. "
            "Reply warmly in simple language and in the user's language (English, Hindi, or Tamil). "
            "Keep answers short, clear, caring, and helpful. Do not ask for passwords, OTPs, PINs, or banking details. "
            f"Today is {today} in Asia/Kolkata. {profile_snippet}{family_instruction}\n"
            "Capabilities & Instructions:\n"
            "1. You have full capability to manage tasks and medicines for the senior. You can:\n"
            "   - Read tasks (get_task_summary), create new tasks (create_task), and mark tasks complete (complete_task).\n"
            "   - Read medicines and reminder schedules (get_medicine_summary), add new medicines with schedules (create_medicine), record taken doses (confirm_medicine_taken), record skipped doses (record_medicine_skipped), and check medicine history (get_medicine_history).\n"
            "   - Read family contacts (get_family_contacts).\n"
            "   - If the user shares personal interests, hobbies, family details, or memories, call update_user_interests to remember them for future sessions.\n"
            "2. Personalization & Continuity:\n"
            "   - Address the senior warmly by name.\n"
            "   - Remember and build upon their routines, interests, and previous context from earlier in the chat.\n"
            "   - When adding or changing a task or medicine, confirm the action warmly with the details.\n"
            "   - If the user asks about screen sharing or wanting to show their screen, warmly guide them to switch to the 'Voice & screen' tab and tap 'Share screen'."
        )
        contents = [
            types.Content(role=message.role, parts=[types.Part.from_text(text=message.content)])
            for message in payload.messages
        ]
        tool = types.Tool(function_declarations=AI_COMPANION_TOOLS)
        config = types.GenerateContentConfig(
            system_instruction=instruction,
            tools=[tool],
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
        for _ in range(4):
            calls = response.function_calls or []
            if not calls:
                break
            candidate = response.candidates[0] if response.candidates else None
            if not candidate or not candidate.content:
                break
            contents.append(candidate.content)
            function_responses = []
            for call in calls:
                try:
                    call_args = dict(call.args or {})
                    if payload.family_id and not call_args.get("family_id"):
                        call_args["family_id"] = str(payload.family_id)
                    result = await execute_tool(
                        AIToolExecution(name=call.name, arguments=call_args, confirmed=True),
                        user=user,
                        db=db,
                    )
                except Exception as exc:
                    logger.warning("Tool %s execution error: %s", call.name, exc)
                    result = {"error": str(exc)}
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
    mutating = payload.name in {
        "create_task",
        "complete_task",
        "create_medicine",
        "confirm_medicine_taken",
        "record_medicine_skipped",
        "update_user_interests",
    }
    if mutating and not payload.confirmed:
        raise ServiceError(409, "The user must confirm this change before it can be executed")
    if payload.name == "get_task_summary":
        params = {"order": "due_at.asc.nullslast,created_at.desc"}
        try:
            fam_id = await _resolve_family_id(args, user["id"], db)
            params["family_id"] = f"eq.{fam_id}"
        except Exception:
            if args.get("family_id"):
                params["family_id"] = f"eq.{args['family_id']}"
        return {"tasks": await db.select("tasks", **params)}
    if payload.name == "create_task":
        fam_id = await _resolve_family_id(args, user["id"], db)
        assigned_to = args.get("assigned_to") or user["id"]
        task_data = {
            "family_id": fam_id,
            "title": str(args["title"]).strip(),
            "description": args.get("description"),
            "assigned_to": str(assigned_to),
            "assigned_by": user["id"],
        }
        if args.get("due_at"):
            task_data["due_at"] = args["due_at"]
        created = await db.insert("tasks", task_data)
        return {"result": "created", "task": created}
    if payload.name == "complete_task":
        task_id = args.get("task_id")
        if not task_id and args.get("title"):
            user_tasks = await db.select(
                "tasks",
                columns="id,title,status",
                assigned_to=f"eq.{user['id']}",
                status="eq.pending",
                limit="25",
            )
            query_title = str(args["title"]).lower()
            match = next((t for t in user_tasks if query_title in str(t.get("title", "")).lower()), None)
            if match:
                task_id = match["id"]
        if not task_id:
            raise ServiceError(404, "Task not found. Please specify which task to mark complete.")
        log = await db.rpc("complete_task", {"p_task_id": str(task_id)})
        return {"result": "completed", "task_id": str(task_id), "log": log}
    if payload.name == "get_medicine_summary":
        params = {"order": "name.asc", "is_active": "eq.true"}
        try:
            fam_id = await _resolve_family_id(args, user["id"], db)
            params["family_id"] = f"eq.{fam_id}"
        except Exception:
            if args.get("family_id"):
                params["family_id"] = f"eq.{args['family_id']}"
        medicines = await db.select("medications", **params)
        for medicine in medicines:
            medicine["schedules"] = await db.select(
                "medication_schedules", medication_id=f"eq.{medicine['id']}", is_active="eq.true", order="scheduled_time.asc"
            )
        return {"medicines": medicines}
    if payload.name == "create_medicine":
        fam_id = await _resolve_family_id(args, user["id"], db)
        med_data = {
            "family_id": fam_id,
            "elderly_user_id": user["id"],
            "created_by": user["id"],
            "name": str(args["name"]).strip(),
            "dosage": args.get("dosage"),
            "instructions": args.get("instructions"),
            "is_active": True,
        }
        med = await db.insert("medications", med_data)
        sched_result = None
        if args.get("scheduled_time") and med.get("id"):
            raw_time = str(args["scheduled_time"]).strip()
            parts = raw_time.split(":")
            if len(parts) == 2:
                time_str = f"{int(parts[0]):02d}:{int(parts[1]):02d}"
                raw_days = args.get("days_of_week") or [0, 1, 2, 3, 4, 5, 6]
                days = sorted(list(set(int(d) % 7 for d in raw_days if isinstance(d, (int, float, str)) and str(d).isdigit()))) or [0, 1, 2, 3, 4, 5, 6]
                try:
                    sched_result = await db.insert("medication_schedules", {
                        "medication_id": str(med["id"]),
                        "family_id": fam_id,
                        "scheduled_time": time_str,
                        "days_of_week": days,
                        "is_active": True,
                    })
                except Exception as sched_err:
                    logger.warning("Could not create schedule: %s", sched_err)
        return {"result": "created", "medicine": med, "schedule": sched_result}
    if payload.name in {"confirm_medicine_taken", "record_medicine_skipped"}:
        med_id = args.get("medicine_id")
        if not med_id and (args.get("medicine_name") or args.get("name")):
            query_name = str(args.get("medicine_name") or args.get("name")).lower().strip()
            meds = await db.select("medications", columns="id,name", is_active="eq.true", limit="50")
            match = next((m for m in meds if query_name in str(m.get("name", "")).lower()), None)
            if match:
                med_id = match["id"]
        if not med_id:
            raise ServiceError(404, "Medicine not found. Please provide the medicine name or ID.")
        status = "confirmed_taken" if payload.name == "confirm_medicine_taken" else "skipped"
        log = await db.rpc("record_medication_status", {
            "p_medication_id": str(med_id),
            "p_status": status,
            "p_scheduled_for": args.get("scheduled_for"),
            "p_note": args.get("note"),
        })
        return {"result": "recorded", "status": status, "log": log}
    if payload.name == "update_user_interests":
        patch_data = {}
        if "interests" in args and isinstance(args["interests"], list):
            current = await db.select("profiles", columns="interests", id=f"eq.{user['id']}", limit="1")
            existing = current[0].get("interests") or [] if current else []
            new_items = [str(i).strip() for i in args["interests"] if str(i).strip()]
            merged = list(dict.fromkeys(existing + new_items))
            patch_data["interests"] = merged
        if "bio" in args and args["bio"]:
            current = await db.select("profiles", columns="bio", id=f"eq.{user['id']}", limit="1")
            existing_bio = current[0].get("bio") or "" if current else ""
            addition = str(args["bio"]).strip()
            if existing_bio:
                patch_data["bio"] = f"{existing_bio} | {addition}"[:1000]
            else:
                patch_data["bio"] = addition[:1000]
        if patch_data:
            await db.patch("profiles", {"id": f"eq.{user['id']}"}, patch_data)
        return {"result": "updated", "saved": patch_data}
    if payload.name == "get_medicine_history":
        try:
            fam_id = await _resolve_family_id(args, user["id"], db)
            family_id = UUID(str(fam_id))
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
        fam_id = await _resolve_family_id(args, user["id"], db)
        members = await db.select("family_members", family_id=f"eq.{fam_id}", status="eq.active")
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
