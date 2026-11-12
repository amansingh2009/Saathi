from fastapi import APIRouter

from app.api.v1 import activity, ai, emergency, families, guidance, medicines, notifications, profiles, tasks

api_router = APIRouter()
for module in (profiles, families, tasks, medicines, ai, guidance, emergency, notifications, activity):
    api_router.include_router(module.router)
