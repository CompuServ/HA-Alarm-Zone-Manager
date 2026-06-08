"""Config flow for Alarm Zone Manager."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN


class AlarmZoneManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create config entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="Alarm Zone Manager", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return AlarmZoneManagerOptionsFlowHandler()


class AlarmZoneManagerOptionsFlowHandler(config_entries.OptionsFlow):
    """Options flow handler."""

    async def async_step_init(self, user_input=None):
        return self.async_create_entry(title="", data={})
