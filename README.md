# HA-Alarm-Zone-Manager

**ALPHA/WIP** — A comprehensive interface for adding alarm automation with an enterprise/commercial feature set.

Repository: [https://github.com/CompuServ/HA-Alarm-Zone-Manager](https://github.com/CompuServ/HA-Alarm-Zone-Manager)

## Disclaimers

**NFPA/UL:** The code in this project is not intended to meet insurance or AHJ requirements for maintaining or commissioning a life safety system, intrusion system, or fire protection system. Possible injuries may include personal injuries, property damage, and/or loss of life. For personal use or research purposes only.

**AI disclosure:** This code contains AI-generated content.

## Overview

Home Assistant custom integration for managing up to **1024 alarm zones**, **32 partitions**, **32 keypads**, **128 alarm users**, and a full **event log** — with a spreadsheet-style sidebar panel.

The goal is to add commercial-grade intrusion and fire alarm features to Home Assistant and democratize functionality often limited to cost-prohibitive commercial equipment.

## Installation

### Manual

1. Copy the `custom_components/alarm_zone_manager` folder into your Home Assistant `config/custom_components/` directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and search for **Alarm Zone Manager**.
4. Open the **Alarm Zones** sidebar panel.

### HACS (custom repository)

1. In HACS, add custom repository: `https://github.com/CompuServ/HA-Alarm-Zone-Manager`
2. Category: **Integration**
3. Install **Alarm Zone Manager** and restart Home Assistant.

**Required repository layout for HACS:**

```
HA-Alarm-Zone-Manager/
├── custom_components/
│   └── alarm_zone_manager/
│       ├── __init__.py
│       ├── manifest.json
│       └── ...
├── brand/
│   └── icon.png
├── hacs.json
└── README.md
```

<<<<<<< HEAD
=======

>>>>>>> 4b959c051e0afde00a7251717ae828b27ab3d927
## Keypads on Dashboard

1. Enable a keypad in the **Keypads** tab.
2. Add the custom card `custom:alarm-keypad-card` to a Lovelace dashboard.
3. Set the `entity` to the keypad helper sensor (e.g. `sensor.intrusion_alarm_keypad_keypad_1`).

Register the Lovelace resource (if not auto-registered):

```yaml
resources:
  - url: /alarm_zone_manager/keypad-card.js
    type: module
```

## Developer / Zone Test Tool

In **Options → Developer Options**, enable **Zone Test Tool** to show an **Activate** column on the Zones tab for integration testing.

## Tests

```bash
pip install pytest
pytest tests/
```

## Status

Work in progress. Comprehensive documentation is planned for a future release.
