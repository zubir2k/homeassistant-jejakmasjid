<img src="custom_components/jejakmasjid/brand/logo.png" alt="Jejak Masjid" height="90" align="right">

# 🕌 Jejak Masjid: Mosque Tracker

[![GitHub Repo stars](https://img.shields.io/github/stars/zubir2k/homeassistant-jejakmasjid?style=social)](https://github.com/zubir2k/homeassistant-jejakmasjid/stargazers)
[![hacs_badge](https://img.shields.io/badge/HACS-Integration-41BDF5.svg)](https://github.com/hacs/integration)
[![Buy](https://img.shields.io/badge/Belanja-Coffee-yellow.svg)](https://zubirco.de/buymecoffee)
[![GitHub Release](https://img.shields.io/github/release/zubir2k/homeassistant-jejakmasjid.svg)](https://github.com/zubir2k/homeassistant-jejakmasjid/releases/)

An **unofficial**, community-built Home Assistant custom integration for [Jejak Masjid](https://jejakmasjid.my/en). Track and discover nearby masjid, surau, and madrasah for every family member with GPS location and for your Home zone. Includes a bundled, interactive Lovelace Leaflet map card with one-tap driving directions and app check-in support.

---

## What is Jejak Masjid 🔍

Jejak Masjid is a free app for finding mosques and surau near you, at home or on your travels. Check prayer times and keep a record of every visit.

<a href="https://apps.apple.com/my/app/jejak-masjid-masjid-journey/id6757920248"><img src="https://jejakmasjid.my/app-store-badge.svg" height="40"></a>&nbsp;<a href="https://play.google.com/store/apps/details?id=my.lonasoft.jejakmasjidmobile"><img src="https://jejakmasjid.my/play-store-badge.svg" height="40"></a>

---

## Integration Features

- **Dynamic Person & Home Tracking**: Automatically monitors GPS coordinates from every active `person` entity as well as `zone.home`.
- **Bundled Lovelace Map Card**: Includes a built-in, zero-setup Leaflet map card (`custom:jejakmasjid-card`) with live pins, type filters (Masjid, Surau, Madrasah), distance badges, one-tap navigation, and Jejak Masjid app check-in.
- **Comprehensive Sensor Suite**: Exposes dedicated sensors for nearest place name, distance in kilometers, dedicated masjid and surau entities, and aggregate counts within radius.
- **Actionable Service (`find_nearby`)**: Query places around any person, zone, or custom GPS coordinates with configurable limits and type filters for automations and voice assistants.
- **Privacy-Conscious Caching**: GPS coordinates are rounded to ~110m (3 decimal places) before querying the public API; searches are cached locally (`.storage`) and shared across family members to minimize upstream requests.
- **Zero Database Bloat**: Employs `_unrecorded_attributes` to prevent the large list of nearby places from bloating the Home Assistant Recorder database.
- **Standardized Client Library**: Powered by the standalone [`python-jejakmasjid`](https://pypi.org/project/python-jejakmasjid/).

---

## Installation

### With Marketplace / HACS (Recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=zubir2k&repository=homeassistant-jejakmasjid&category=integration)

> [!TIP]
> If you are unable to use the button above:
> 1. In Home Assistant, open **Marketplace/HACS → Integrations**.
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

![jejakmasjid-card](https://github.com/user-attachments/assets/661b901c-4e35-41f1-8661-31d0d6a9669d)

### Card Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `entity` | `string` | *(First available sensor)* | Any `person` entity or `zone.home`. |
| `filter` | `string` | `all` | Initial filter: `all`, `masjid`, `surau`, `other`. |
| `show_map` | `boolean` | `true` | Show/hide the interactive map canvas. |
| `map_height` | `number` | `360` | Height of the map in pixels. |
| `max_items` | `number` | `8` | Number of nearby places shown in the list. |
| `show_checkin` | `boolean` | `true` | Show direct "Check in" action to open the Jejak Masjid mobile app. |
| `checkin_radius_m` | `number` | `50` | Proximity radius (meters) before check-in button becomes active. |
| `language` | `string` | `auto` | UI language: `auto` (follows HA), `en` (English), or `ms` (Bahasa Melayu). |

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
  latitude: 3.1444
  longitude: 101.6917
  radius: 5
  limit: 10
```

---

## Credits & Attribution

- **[Jejak Masjid](https://jejakmasjid.my/)**: Heartfelt thanks to the **Jejak Masjid team & developer** for their dedication to the Muslim community across Malaysia, and for graciously supporting and providing dedicated API access to empower Home Assistant users.
- **Leaflet & OpenStreetMap**: Interactive map visualisations powered by [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/) contributors.

---

## Disclaimer

This is an **unofficial, community-developed** integration. While built with the gracious blessing and API support from the Jejak Masjid developer, it is not an official product of or formally affiliated with Lonasoft. Please do not contact the Jejak Masjid app support team for Home Assistant integration issues — open an issue on this repository instead.

---

## Join the Community

- 🇲🇾 **Home Assistant Malaysia**: Join our local smart home discussions on [Facebook - Home Assistant Malaysia](https://www.facebook.com/groups/homeassistantmalaysia)
- 💬 **Home Assistant Community**: Share automations and feedback on the official [Home Assistant Community Forum](https://community.home-assistant.io/)

---

## License

Licensed under the [MIT License](LICENSE).
