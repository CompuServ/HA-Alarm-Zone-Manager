"""Custom panel registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE, PANEL_URL


def async_register_panel(hass: HomeAssistant) -> None:
    """Register custom sidebar panel."""
    path = Path(__file__).parent / "frontend" / "dist"
    hass.http.register_static_path(
        PANEL_URL,
        str(path),
        cache_headers=False,
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
