![JejakMasjid](/custom_components/jejakmasjid/brand/logo.png)

[![GitHub Repo stars](https://img.shields.io/github/stars/zubir2k/homeassistant-jejakmasjid?style=social)](https://github.com/zubir2k/homeassistant-jejakmasjid/stargazers)
[![hacs_badge](https://img.shields.io/badge/HACS-Integration-41BDF5.svg)](https://github.com/hacs/integration)
[![Buy](https://img.shields.io/badge/Belanja-Coffee-yellow.svg)](https://zubirco.de/buymecoffee)
[![GitHub Release](https://img.shields.io/github/release/zubir2k/homeassistant-jejakmasjid.svg)](https://github.com/zubir2k/homeassistant-jejakmasjid/releases/)

An **unofficial**, community-built Home Assistant custom integration for [Jejak Masjid](https://jejakmasjid.my). Track and discover nearby masjid, surau, and madrasah for every family member with GPS location and for your Home zone. Includes a bundled, interactive Lovelace Leaflet map card with one-tap driving directions.

---

## Features

- **Dynamic Person & Home Tracking**: Automatically monitors GPS coordinates from every active `person` entity as well as `zone.home`.
- **Bundled Lovelace Map Card**: Includes a built-in, zero-setup Leaflet map card (`custom:jejakmasjid-card`) with live pins, type filters (Masjid, Surau, Madrasah), distance badges, and direct navigation links to Google Maps.
- **Comprehensive Sensor Suite**: Exposes dedicated sensors for nearest place name, distance in kilometers, dedicated masjid and surau entities, and aggregate counts within radius.
- **Actionable Service (`find_nearby`)**: Query places around any person, zone, or custom GPS coordinates with configurable limits and type filters for automations and voice assistants.
- **Privacy-Conscious Caching**: GPS coordinates are rounded to ~110m (3 decimal places) before querying the public API; searches are cached locally (`.storage`) and shared across family members to minimize upstream requests.
- **Zero Database Bloat (ADR-0018)**: Employs `_unrecorded_attributes` to prevent the large list of nearby places from bloating the Home Assistant Recorder database.

---

## Installation

### With Marketplace / HACS (Recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=zubir2k&repository=homeassistant-jejakmasjid&category=integration)

> [!TIP]
> If you are unable to use the button above:
> 1. In Home Assistant, open **HACS → Integrations**.
> 2. Click the three dots in the top-right corner and select **Custom repositories**.
> 3. Add `https://github.com/zubir2k/homeassistant-jejakmasjid` with category **Integration**.
> 4. Search for `Jejak Masjid` and click **Download**.

### Manual Installation

1. Copy the `custom_components/jejakmasjid` folder from this repository into your Home Assistant's `config/custom_components/` directory.
2. Restart Home Assistant.
3. Proceed to the [Setup](#setup) section.

> [!WARNING]
> If installing manually, subscribe to repository releases to be notified of updates.

---

## Setup

[![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=jejakmasjid)

> [!TIP]
> If the button above does not open directly:
> 1. Go to **Settings → Devices & Services**.
> 2. Click **+ Add Integration** in the bottom right corner.
> 3. Search for **Jejak Masjid**.

Configure your desired search radius (1 to 5 km; defaults to 3 km) and scan interval (defaults to 5 minutes). All family members with GPS and the Home zone are configured automatically.

---

## Entities (Per Tracked Person & Home)

| Entity | Type | Unit / State | Notes |
| :--- | :--- | :--- | :--- |
| `sensor.<who>_nearest` | Sensor | Text | Nearest masjid or surau name. Attributes: `place_id`, `type`, `distance_km`, `latitude`, `longitude`, `kursus_haji`, `radius_km`, `nearby`. |
| `sensor.<who>_nearest_distance` | Sensor | `km` | Distance to nearest place (`distance` device class, `measurement` state class). |
| `sensor.<who>_nearest_masjid` | Sensor | Text | Nearest place filtered strictly to masjids. Attributes: `place_id`, `type`, `distance_km`, `latitude`, `longitude`, `kursus_haji`. |
| `sensor.<who>_nearest_surau` | Sensor | Text | Nearest place filtered strictly to suraus. Attributes: `place_id`, `type`, `distance_km`, `latitude`, `longitude`, `kursus_haji`. |
| `sensor.<who>_count` | Sensor | `places` | Total places within radius (`measurement` state class). Attributes: `masjid`, `surau`, `madrasah`, `other`, `radius_km`. |

---

## Lovelace Map Card

The integration automatically registers and serves its bundled frontend map card into Home Assistant dashboards.

Add the custom card to your dashboard:

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

## Actions (Services)

### `jejakmasjid.find_nearby`

Find masjid and surau around an entity or custom GPS coordinates.

```yaml
action: jejakmasjid.find_nearby
data:
  entity_id: person.zubir
  radius: 3
  type: masjid
  limit: 5
```

#### Custom Coordinates Example:
```yaml
action: jejakmasjid.find_nearby
data:
  latitude: 3.02192
  longitude: 101.79148
  radius: 5
  limit: 10
```

---

## Architecture & Standards Compliance

This integration is built in strict accordance with the Home Assistant Architecture Decision Records (ADRs):

- **ADR-0003**: Exposes all sensor data directly; no monitored conditions selectors.
- **ADR-0004**: Pure REST GeoJSON communication; zero webscraping.
- **ADR-0007 / ADR-0010**: Modern UI Config Flow and Options Flow; no YAML integration schemas. Single-instance unique ID abort guard enforced.
- **ADR-0008**: Mandatory code ownership declared in `manifest.json`.
- **ADR-0009**: Complete translations for config, options, entity names, and exceptions without hardcoded entity IDs.
- **ADR-0018**: Database protection using `_unrecorded_attributes` for nearby place lists.
- **ADR-0020**: Modern Python 3.12+ syntax and type annotations.
- **ADR-0022**: Adheres to the Home Assistant Integration Quality Scale.

---

## License

Licensed under the [MIT License](LICENSE).
