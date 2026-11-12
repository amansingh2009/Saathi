import logging
from datetime import timedelta

from livekit.api import AccessToken, VideoGrants

from app.core.config import get_settings

logger = logging.getLogger("saathi.livekit")


def generate_livekit_token(
    user_id: str,
    user_name: str,
    room_name: str,
    ttl_minutes: int = 60,
) -> str:
    settings = get_settings()
    api_key = settings.livekit_api_key or "devkey"
    api_secret = settings.livekit_api_secret or "devsecret_must_be_at_least_32_characters_long_for_hmac"

    if not settings.livekit_api_key or not settings.livekit_api_secret:
        logger.warning(
            "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set; using development fallback credentials for room %s",
            room_name,
        )

    token = (
        AccessToken(api_key, api_secret)
        .with_identity(str(user_id))
        .with_name(user_name or f"User-{user_id[:8]}")
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .with_ttl(timedelta(minutes=ttl_minutes))
    )
    return token.to_jwt()


def get_livekit_url() -> str:
    settings = get_settings()
    return settings.livekit_url

