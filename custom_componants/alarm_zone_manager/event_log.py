"""Event log management."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from typing import Any

from homeassistant.util import dt as dt_util

from .const import (
    EVENT_LOG_STARTUP_SUPPRESS_SECONDS,
    EVENT_SOURCE_SYSTEM,
    EVENT_SOURCE_ZONE_INPUT,
    EVENT_TYPE_ALARM,
    EVENT_TYPE_LOG_EXPORTED,
    EVENT_TYPE_LOG_RESET,
    EVENT_TYPE_RESTORAL,
    EVENT_TYPE_RESTARTED,
)
from .store import EventLogStore

EVENT_TYPE_LABELS = {
    EVENT_TYPE_ALARM: "Alarm",
    EVENT_TYPE_RESTORAL: "Restoral",
    EVENT_TYPE_RESTARTED: "Restarted",
    EVENT_TYPE_LOG_RESET: "Log Reset",
    EVENT_TYPE_LOG_EXPORTED: "Log Exported",
}


class EventLogManager:
    """Manage event log entries."""

    def __init__(self, store: EventLogStore) -> None:
        self._store = store
        self._suppress_until: datetime | None = None

    def start_suppression(self) -> None:
        """Start startup suppression window."""
        self._suppress_until = dt_util.utcnow() + timedelta(
            seconds=EVENT_LOG_STARTUP_SUPPRESS_SECONDS
        )

    def is_suppressed(self) -> bool:
        """Check if alarm/restoral logging is suppressed."""
        if self._suppress_until is None:
            return False
        return dt_util.utcnow() < self._suppress_until

    async def append(
        self,
        event_type: str,
        *,
        zone_id: int | None = None,
        zone_name: str | None = None,
        source: str = EVENT_SOURCE_ZONE_INPUT,
    ) -> dict[str, Any]:
        """Append event log entry."""
        if event_type in (EVENT_TYPE_ALARM, EVENT_TYPE_RESTORAL) and self.is_suppressed():
            return {}

        data = self._store.data or {"next_sequential_id": 1, "entries": []}
        seq_id = int(data.get("next_sequential_id", 1))
        entry = {
            "sequential_id": seq_id,
            "timestamp": dt_util.utcnow().isoformat(),
            "event_type": event_type,
            "zone_id": zone_id,
            "zone_name": zone_name,
            "source": source,
        }
        entries = list(data.get("entries", []))
        entries.append(entry)
        data["entries"] = entries
        data["next_sequential_id"] = seq_id + 1
        self._store._data = data
        await self._store.async_save()
        return entry

    async def log_restarted(self) -> dict[str, Any]:
        """Log integration restarted."""
        return await self.append(
            EVENT_TYPE_RESTARTED, source=EVENT_SOURCE_SYSTEM
        )

    async def log_alarm(
        self,
        zone_id: int,
        zone_name: str,
        *,
        source: str = EVENT_SOURCE_ZONE_INPUT,
    ) -> dict[str, Any]:
        """Log zone alarm."""
        return await self.append(
            EVENT_TYPE_ALARM,
            zone_id=zone_id,
            zone_name=zone_name,
            source=source,
        )

    async def log_restoral(
        self,
        zone_id: int,
        zone_name: str,
        *,
        source: str = EVENT_SOURCE_ZONE_INPUT,
    ) -> dict[str, Any]:
        """Log zone restoral."""
        return await self.append(
            EVENT_TYPE_RESTORAL,
            zone_id=zone_id,
            zone_name=zone_name,
            source=source,
        )

    async def reset(self) -> dict[str, Any]:
        """Reset event log."""
        self._store._data = {"next_sequential_id": 1, "entries": []}
        await self._store.async_save()
        return await self.append(EVENT_TYPE_LOG_RESET, source=EVENT_SOURCE_SYSTEM)

    def format_entry_for_ui(self, entry: dict[str, Any]) -> dict[str, Any]:
        """Format entry with date/time columns."""
        ts = entry.get("timestamp", "")
        dt = dt_util.parse_datetime(ts) or dt_util.utcnow()
        local = dt_util.as_local(dt)
        event_type = entry.get("event_type", "")
        return {
            **entry,
            "date": local.strftime("%Y-%m-%d"),
            "time": local.strftime("%H:%M:%S"),
            "event_type_label": EVENT_TYPE_LABELS.get(event_type, event_type),
        }

    async def export_csv(self) -> tuple[str, str]:
        """Export log as CSV; returns filename and content."""
        entries = self._store.entries
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["Sequential ID", "Date", "Time", "Event Type", "Zone Number", "Zone Name"]
        )
        for entry in entries:
            formatted = self.format_entry_for_ui(entry)
            writer.writerow(
                [
                    formatted.get("sequential_id"),
                    formatted.get("date"),
                    formatted.get("time"),
                    formatted.get("event_type_label"),
                    formatted.get("zone_id") or "",
                    formatted.get("zone_name") or "",
                ]
            )
        now = dt_util.now()
        filename = f"Alarm Log {now.strftime('%Y-%m-%d')}.csv"
        await self.append(EVENT_TYPE_LOG_EXPORTED, source=EVENT_SOURCE_SYSTEM)
        return filename, output.getvalue()
