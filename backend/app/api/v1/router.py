from fastapi import APIRouter

from app.api.v1 import (
    activity,
    ai,
    calls,
    connections,
    emergency,
    families,
    guidance,
    medicines,
    notifications,
    profiles,
    tasks,
)

api_router = APIRouter()
for module in (
    profiles,
    families,
    tasks,
    medicines,
    ai,
    guidance,
    emergency,
    notifications,
    activity,
    connections,
    calls,
):
    api_router.include_router(module.router)
