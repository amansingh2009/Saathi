from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_ENV_FILE), ".env"),
        extra="ignore",
    )

    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    supabase_url: str
    supabase_publishable_key: str
    supabase_jwt_issuer: str
    supabase_jwt_audience: str = "authenticated"
    gemini_api_key: str | None = None
    gemini_live_model: str = "gemini-3.8-live"
    gemini_screen_model: str = "gemini-2.5-flash"
    firebase_credentials_json: str | None = None
    livekit_url: str = "wss://saathi-live.livekit.cloud"
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
