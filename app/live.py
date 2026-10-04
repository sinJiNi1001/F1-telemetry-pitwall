from typing import Any


class FreeArchiveStatus:
    def status(self) -> dict[str, Any]:
        return {
            "configured": True,
            "connected": False,
            "phase": "free_archive_only",
            "session_key": None,
            "session_name": None,
            "country_name": None,
            "location": None,
            "year": None,
            "last_message_at": None,
            "message_count": 0,
            "error": None,
        }

    def snapshot(self) -> dict[str, Any]:
        return {**self.status(), "drivers": []}

    async def run(self) -> None:
        return None

    def stop(self) -> None:
        return None


live_pipeline = FreeArchiveStatus()