# Jejak Masjid for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/default)
[![Quality Scale](https://img.shields.io/badge/Quality%20Scale-Silver-silver.svg)](https://developers.home-assistant.io/docs/core/integration-quality-scale/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**Jejak Masjid** brings nearby masjid and surau discovery to Home Assistant for every family member with GPS location and for your Home zone. Powered by the open [Jejak Masjid](https://jejakmasjid.my) community map.

---

## ✨ Features

- 📍 **Follows Family Members & Home**: Automatically monitors all `person` entities with GPS coordinates as well as `zone.home`.
- 🗺️ **Bundled Lovelace Map Card**: Includes an interactive Leaflet map card (`custom:jejakmasjid-card`) showing nearby places, type filters (Masjid, Surau, Madrasah), distance badges, and direct Google Maps navigation links.
- 📊 **Rich Sensors**: Creates dedicated sensors for each person and Home:
  - **Nearest**: Name of the nearest masjid or surau.
  - **Nearest Distance**: Distance in kilometers (with `distance` device class and `measurement` state class).
  - **Nearest Masjid**: Filtered to masjids only.
  - **Nearest Surau**: Filtered to suraus only.
  - **Nearby Count**: Total number of places within the configured search radius.
- ⚡ **Action / Service (`jejakmasjid.find_nearby`)**: Run searches around any person, zone, or custom latitude/longitude with radius, type, and result limits for scripts, automations, and Assist voice commands.
- 🛡️ **Zero Database Bloat (ADR-0018)**: Employs `_unrecorded_attributes` to prevent the large list of nearby places from bloating the Home Assistant Recorder database.
- 🔒 **Privacy-First & Efficient**: Search coordinates are rounded to ~110m (3 decimal places) before reaching the API. Shared searches and persistent local caching (`.storage`) minimize network calls and survive restarts.

---

## 📦 Installation

### Option 1: HACS (Recommended)

1. Open **HACS** in your Home Assistant.
2. Click the three dots in the top right corner and select **Custom repositories**.
3. Add `https://github.com/zubir2k/homeassistant-jejakmasjid` with category **Integration**.
4. Click **Download**, then restart Home Assistant.

### Option 2: Manual Installation

1. Download the latest release.
2. Copy the `custom_components/jejakmasjid` folder to your Home Assistant `config/custom_components/` directory.
3. Restart Home Assistant.

---

## ⚙️ Configuration

1. In Home Assistant, go to **Settings** > **Devices & Services** > **Add Integration**.
2. Search for **Jejak Masjid** and select it.
3. Set your preferred:
   - **Search Radius** (1 to 5 km; defaults to 3 km).
   - **Update Interval** (1 to 60 minutes; defaults to 5 minutes).
4. Click **Submit**.

> **Note**: Update intervals only poll person positions locally. An external API call is only triggered when a person moves outside their previous search zone or when the cache expires (24h).

---

## 🎴 Lovelace Map Card

The integration automatically serves and registers its bundled Lovelace card.

Add a custom card to your dashboard:

```yaml
type: custom:jejakmasjid-card
entity: person.zubir
```

### Card Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `entity` | `string` | *(First available sensor)* | Any `person` entity or `zone.home`. |
| `default_filter` | `string` | `all` | Initial filter: `all`, `masjid`, `surau`, `other`. |
| `height` | `string` | `400px` | Height of the map canvas. |

---

## 🛠️ Actions / Services

### `jejakmasjid.find_nearby`

Find masjid and surau around an entity or GPS coordinate.

#### Example Service Call:
```yaml
action: jejakmasjid.find_nearby
data:
  entity_id: person.zubir
  radius: 3
  type: masjid
  limit: 5
```

---

## 🏛️ Architecture & Standards Compliance

This integration is built in strict accordance with the Home Assistant Architecture Decision Records (ADRs):

- **ADR-0003**: All metrics exposed directly; no monitored conditions selectors.
- **ADR-0004**: Official REST API, zero webscraping.
- **ADR-0007 / ADR-0010**: Modern UI Config Flow and Options Flow; no YAML integration schemas.
- **ADR-0008**: Mandatory code ownership declared in `manifest.json`.
- **ADR-0009**: Complete translations for config, options, entity names, and exceptions without hardcoded entity IDs.
- **ADR-0018**: Database protection using `_unrecorded_attributes`.
- **ADR-0020**: Modern Python 3.12+ type system and async patterns.
- **ADR-0022**: Adheres to the Home Assistant Integration Quality Scale.

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).
