from fastapi import Depends

from app.core.auth import current_user
from app.core.supabase_rest import SupabaseREST


async def db_for_user(user: dict = Depends(current_user)) -> SupabaseREST:
    return SupabaseREST(user["access_token"])
