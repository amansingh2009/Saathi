import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.errors import ServiceError

bearer_auth = HTTPBearer(auto_error=False)


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_auth)) -> dict:
    """Ask Supabase Auth to validate the bearer JWT and return verified claims."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ServiceError(401, "Authentication required")
    settings = get_settings()
    token = credentials.credentials.strip()
    if not token:
        raise ServiceError(401, "Authentication required")
    authorization = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": authorization},
            )
    except httpx.HTTPError as exc:
        raise ServiceError(503, "Authentication service is unavailable") from exc
    if response.status_code != 200:
        raise ServiceError(401, "Invalid or expired session")
    user = response.json()
    if not user.get("id"):
        raise ServiceError(401, "Invalid session")
    return {**user, "access_token": token}
