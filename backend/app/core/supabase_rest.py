from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import get_settings
from app.core.errors import ServiceError


class SupabaseREST:
    def __init__(self, access_token: str) -> None:
        self.settings = get_settings()
        self.access_token = access_token

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: Any = None,
        prefer: str | None = "return=representation",
    ) -> Any:
        headers = {
            "apikey": self.settings.supabase_publishable_key,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.request(
                    method,
                    f"{self.settings.supabase_url}/rest/v1/{path.lstrip('/')}",
                    params=params,
                    headers=headers,
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise ServiceError(503, "Database service is unavailable") from exc
        if response.status_code >= 400:
            import logging
            logging.getLogger("saathi.supabase").error("Supabase error %s: %s", response.status_code, response.text)
            err_msg = ""
            try:
                err_json = response.json()
                if isinstance(err_json, dict) and err_json.get("message"):
                    err_msg = err_json["message"]
            except Exception:
                pass

            if err_msg == "invitation unavailable":
                raise ServiceError(404, "Invitation code not found or expired. Please check the code.")
            if err_msg == "invitation email mismatch":
                raise ServiceError(403, "This invitation was sent to a different email address.")
            if response.status_code in (401, 403):
                raise ServiceError(response.status_code, f"Not authorized for this resource: {err_msg or response.text}")
            if response.status_code == 404:
                raise ServiceError(404, err_msg or "Resource not found")
            if response.status_code == 409:
                raise ServiceError(409, err_msg or "The requested change conflicts with existing data")
            if response.status_code == 400:
                raise ServiceError(400, err_msg or "Invalid request")
            raise ServiceError(502, err_msg or "Database request failed")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def select(self, table: str, *, columns: str = "*", **params: str) -> list[dict]:
        result = await self.request("GET", table, params={"select": columns, **params}, prefer=None)
        return result if isinstance(result, list) else []

    async def insert(self, table: str, row: dict) -> dict:
        result = await self.request("POST", table, body=row)
        return result[0] if isinstance(result, list) and result else {}

    async def patch(self, table: str, filters: dict[str, str], values: dict) -> dict:
        result = await self.request("PATCH", table, params=filters, body=values)
        if not isinstance(result, list) or not result:
            raise ServiceError(404, "Resource not found")
        return result[0]

    async def delete(self, table: str, filters: dict[str, str]) -> None:
        await self.request("DELETE", table, params=filters, prefer=None)

    async def rpc(self, function: str, args: dict) -> Any:
        return await self.request("POST", f"rpc/{quote(function)}", body=args)
