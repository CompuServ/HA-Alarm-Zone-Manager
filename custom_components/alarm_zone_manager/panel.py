"""Custom panel registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE, PANEL_URL

KEYPAD_CARD_URL = "/alarm_zone_manager/keypad-card.js"
DATA_STATIC_REGISTERED = f"{DOMAIN}_static_registered"


async def async_register_static_assets(hass: HomeAssistant) -> None:
    """Register panel and Lovelace static assets once."""
    if hass.data.get(DATA_STATIC_REGISTERED):
        return

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
    hass.data[DATA_STATIC_REGISTERED] = True


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register custom sidebar panel."""
    from homeassistant.components import frontend

    if frontend.async_panel_exists(hass, DOMAIN):
        frontend.async_remove_panel(hass, DOMAIN, warn_if_unknown=False)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=DOMAIN,
        webcomponent_name="alarm-zone-panel",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        js_url=f"{PANEL_URL}/alarm-zone-panel.js",
        embed_iframe=False,
        require_admin=False,
        config_panel_domain=DOMAIN,
    )
