"""Custom panel registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE, PANEL_URL

KEYPAD_CARD_URL = "/alarm_zone_manager/keypad-card.js"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register custom sidebar panel and static assets."""
    base = Path(__file__).parent
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                PANEL_URL,
                str(base / "frontend" / "dist"),
                cache_headers=False,
            ),
            StaticPathConfig(
                KEYPAD_CARD_URL,
                str(base / "frontend" / "lovelace" / "alarm-keypad-card.js"),
                cache_headers=True,
            ),
        ]
    )
    frontend.async_register_built_in_panel(
        component_name=DOMAIN,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=DOMAIN,
        require_admin=False,
        config={
            "_panel_custom": {
                "name": "alarm-zone-panel",
                "embed_iframe": False,
                "trust_external": False,
                "js_url": f"{PANEL_URL}/alarm-zone-panel.js",
            }
        },
    )
