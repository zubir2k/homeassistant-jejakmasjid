"""Constants for the Jejak Masjid integration."""
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo

DOMAIN = "jejakmasjid"

API_BASE = "https://apiv2.jejakmasjid.my"
HEALTH_URL = f"{API_BASE}/"
USER_AGENT = "homeassistant-jejakmasjid (+https://github.com/zubir2k/homeassistant-jejakmasjid)"

# Update interval, minutes. Each update only reads person locations; the API is called
# only when someone moved far enough or their cached result expired (see coordinator).
DEFAULT_SCAN_INTERVAL = 5
MIN_SCAN_INTERVAL = 1
MAX_SCAN_INTERVAL = 60

# Search radius in km. The API caps it at 5.
CONF_RADIUS = "radius"
DEFAULT_RADIUS = 3
MIN_RADIUS = 1
MAX_RADIUS = 5

# Every API search asks for the API's maximum radius, while sensors and the card show only the
# chosen radius. A cached search keeps serving a location until it moves FETCH_RADIUS_KM -
# radius away from the search centre (at least MIN_REFETCH_KM), so short trips reuse it.
FETCH_RADIUS_KM = 5
MIN_REFETCH_KM = 0.3
# Masjid and surau rarely move: a search stays valid this long
CACHE_TTL_HOURS = 24
# Search centres are rounded to 3 decimals (about 110 m) before they leave Home Assistant
COORD_DECIMALS = 3
# After a failed call, wait this long before calling again for that spot
FAILURE_BACKOFF_MINUTES = 15
# Searches kept in memory and in .storage
MAX_CACHED_SEARCHES = 12
CACHE_STORAGE_VERSION = 1

# Places listed in the "nearby" attribute (drawn by the card; kept out of the recorder)
NEARBY_LIMIT = 100

PLACE_TYPES = ["masjid", "surau", "madrasah", "other"]


def get_device_info(entry_id: str) -> DeviceInfo:
    """Shared service device for all Jejak Masjid entities."""
    return DeviceInfo(
        identifiers={(DOMAIN, entry_id)},
        name="Jejak Masjid",
        manufacturer="Jejak Masjid community",
        model="Masjid & surau finder",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url="https://jejakmasjid.my",
    )
