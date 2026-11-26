/*
 * jejakmasjid-card: nearby masjid and surau for each tracked person (and Home) on a map,
 * with a type filter and Google Maps / navigation links.
 * Ships inside custom_components/jejakmasjid and is loaded automatically.
 * Map: Leaflet 1.9.4 (BSD-2) with OpenStreetMap tiles. Logo and marker art: Jejak Masjid's own.
 */
const BASE = new URL(".", import.meta.url).href.replace(/\/$/, "");
const VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";
// The stats card ships alongside; one resource loads both.
import(`${BASE}/jejakmasjid-stats-card.js?v=${VERSION}`).catch(() => {});
const CARD_TYPE = "custom:jejakmasjid-card";

const TYPES = {
  masjid: { en: "Masjid", ms: "Masjid", color: "#00A9A5" },
  surau: { en: "Surau", ms: "Surau", color: "#003130" },
  other: { en: "Others", ms: "Lain-lain", color: "#E3B84F" },
};
const FILTERS = ["all", "masjid", "surau", "other"];
const T = {
  en: { checkin: "Check in", here: "You're here", nearest: "Nearest", refresh: "Refresh location", all: "All", within: "within", places: "places", none: "Nothing of this type nearby.", maps: "Maps", go: "Navigate", info: "Info",
        home: "Home", noData: "No Jejak Masjid sensors yet. Add the Jejak Masjid integration first.", empty: "No masjid or surau found within" },
  ms: { checkin: "Daftar masuk", here: "Anda di sini", nearest: "Terdekat", refresh: "Muat semula lokasi", all: "Semua", within: "dalam", places: "tempat", none: "Tiada tempat jenis ini berdekatan.", maps: "Peta", go: "Navigasi", info: "Info",
        home: "Rumah", noData: "Tiada sensor Jejak Masjid lagi. Tambah integrasi Jejak Masjid dahulu.", empty: "Tiada masjid atau surau dalam" },
};
const IMG = (n) => `${BASE}/img/${n}.png?v=${VERSION}`;
// madrasah and anything unrecognised count as "other" in the card
const group = (t) => (t === "masjid" || t === "surau" ? t : "other");

let leafletPromise;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${BASE}/leaflet.js?v=1.9.4`;
      s.onload = () => resolve(window.L);
      s.onerror = () => reject(new Error("Leaflet failed to load"));
      document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeHttpUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  try {
    const u = new URL(clean);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.href;
    }
  } catch (_) {}
  return null;
};
const numCoord = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};
const mapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${numCoord(p.latitude)},${numCoord(p.longitude)}`;
// Navigate: Android gets a geo: link, so the phone shows its own "Open with" chooser (Maps, Waze, ...);
// iPhone/iPad gets Apple Maps; everything else falls back to Google Maps directions.
const UA = navigator.userAgent || "";
const IS_ANDROID = /Android/i.test(UA);
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const navUrl = (p) => {
  const lat = numCoord(p.latitude);
  const lon = numCoord(p.longitude);
  return IS_ANDROID ? `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(nice(p.name))})`
    : IS_IOS ? `maps://?daddr=${lat},${lon}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
};
const navTarget = () => (IS_ANDROID || IS_IOS ? "_self" : "_blank");
// iOS has no system "Open with" for directions, so the card shows its own sheet with the apps people use here.
const iosApps = (p) => {
  const lat = numCoord(p.latitude);
  const lon = numCoord(p.longitude);
  return [
    { n: "Apple Maps", u: `maps://?daddr=${lat},${lon}&dirflg=d` },
    { n: "Google Maps", u: `comgooglemaps://?daddr=${lat},${lon}&directionsmode=driving` },
    { n: "Waze", u: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes` },
  ];
};
// Check in: hand the place to the Jejak Masjid app. {id}, {lat}, {lng}, {name} are filled in.
const DEFAULT_CHECKIN_URI = "jejakmasjidmobile://checkin"; // app scheme from the APK (Android + iOS share it); "jejakmasjidmobile://masjid/{id}" opens the place page instead
const checkinUrl = (tpl, p) => (tpl || DEFAULT_CHECKIN_URI)
  .replace(/\{id\}/g, encodeURIComponent(p.id)).replace(/\{lat\}/g, numCoord(p.latitude)).replace(/\{lng\}/g, numCoord(p.longitude))
  .replace(/\{name\}/g, encodeURIComponent(p.name || ""));
const STORE = {
  android: "https://play.google.com/store/apps/details?id=my.lonasoft.jejakmasjidmobile",
  ios: "https://apps.apple.com/my/app/id6757920248",
  web: "https://jejakmasjid.my",
};
// Android: wrap the app link in an intent: URL so a phone without the app goes to Play Store.
const androidIntent = (uri) => {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(uri);
  if (!m || /^https?$/i.test(m[1])) return uri;
  return `intent://${m[2]}#Intent;scheme=${m[1]};package=my.lonasoft.jejakmasjidmobile;S.browser_fallback_url=${encodeURIComponent(STORE.android)};end`;
};
// Open the app; if it didn't take over the screen within ~1.5 s, assume it isn't installed.
function openCheckin(uri) {
  if (IS_ANDROID) { window.location.href = androidIntent(uri); return; }
  if (!IS_IOS) { window.open(STORE.web, "_blank", "noopener"); return; }
  let left = false;
  const gone = () => { left = true; };
  document.addEventListener("visibilitychange", gone, { once: true });
  window.addEventListener("pagehide", gone, { once: true });
  window.location.href = uri;
  setTimeout(() => {
    document.removeEventListener("visibilitychange", gone);
    window.removeEventListener("pagehide", gone);
    if (!left && !document.hidden) window.location.href = STORE.ios;
  }, 1500);
}
const distM = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const ICON_REFRESH = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
const ICON_LOCATE = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
// Many names are ALL CAPS; show them in title case
const nice = (n) => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s\-(\/'])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : n);
const fmtDist = (p) => {
  let s = "";
  if (p.distance_m != null) {
    const dm = Number(p.distance_m);
    s = dm < 1000 ? `${dm} m` : `${(dm / 1000).toFixed(1)} km`;
  } else if (p.distance_km != null) {
    const dkm = Number(p.distance_km);
    s = dkm < 1 ? `${Math.round(dkm * 1000)} m` : `${dkm.toFixed(1)} km`;
  }
  return p.direction ? `${s} (${esc(p.direction)})` : s;
};

class JejakMasjidCard extends HTMLElement {
  setConfig(config) {
    this._cfg = {
      show_map: true, map_height: 360, max_items: 8, filter: "all",
      show_people: true, dark_tiles: "auto", language: "auto",
      show_checkin: true, checkin_radius_m: 50, checkin_uri: DEFAULT_CHECKIN_URI,
      ...config,
    };
    this._filter = FILTERS.includes(this._cfg.filter) ? this._cfg.filter : "all";
    this._source = null;
    this._built = false;
    this._stamp = null;
    if (this._hass) this._render();
  }

  static getStubConfig() {
    return { filter: "all" };
  }

  static getConfigElement() {
    return document.createElement("jejakmasjid-card-editor");
  }

  getCardSize() {
    return (this._cfg?.show_map ? Math.ceil(this._cfg.map_height / 50) : 0) + 2 + Math.min(this._cfg?.max_items || 8, 8);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._cfg) return;
    this._render();
  }

  connectedCallback() {
    const el = this.shadowRoot?.getElementById("map");
    if (this._ro && el) this._ro.observe(el);
    if (this._map) {
      setTimeout(() => {
        if (!this._map) return;
        this._map._sizeChanged = true;
        this._map.invalidateSize({ pan: false });
        if (!this._userInteracted) this._fitOrCenter();
      }, 100);
    }
  }

  get _lang() {
    const l = this._cfg.language;
    if (l === "en" || l === "ms") return l;
    return (this._hass?.locale?.language || this._hass?.language || "en").startsWith("ms") ? "ms" : "en";
  }

  get _dark() {
    const d = this._cfg.dark_tiles;
    if (d === true || d === "true") return true;
    if (d === false || d === "false") return false;
    return !!this._hass?.themes?.darkMode;
  }

  // Every "nearest" sensor this integration made: one per person with GPS, plus Home.
  _sources() {
    const out = [];
    for (const [id, st] of Object.entries(this._hass.states)) {
      if (!id.startsWith("sensor.") || !Array.isArray(st.attributes.nearby) || !("radius_km" in st.attributes)) continue;
      const src = st.attributes.source || "";
      const who = src === "zone.home" ? T[this._lang].home : this._hass.states[src]?.attributes.friendly_name || src.split(".")[1] || id;
      const o = this._hass.states[src]?.attributes;
      out.push({ id, who, src, st, origin: o && o.latitude != null ? [o.latitude, o.longitude] : null,
                 user: this._hass.states[src]?.attributes.user_id });
    }
    // people first, Home last
    return out.sort((a, b) => (a.src === "zone.home") - (b.src === "zone.home") || a.who.localeCompare(b.who));
  }

  // The sensor picked in the config: by person (v0.3.5+), or a legacy sensor entity.
  _wanted(sources) {
    const e = this._cfg.entity || "";
    const p = this._cfg.person || (e.startsWith("person.") ? e : null);
    return (p && sources.find((s) => s.src === p)?.id) || (e.startsWith("sensor.") ? e : null);
  }

  // Start on the configured person, else whoever is looking at the dashboard, else Home.
  _defaultSource(sources) {
    const want = this._wanted(sources);
    return (
      sources.find((s) => s.id === want) ||
      sources.find((s) => s.user && s.user === this._hass.user?.id) ||
      sources.find((s) => s.src === "zone.home") ||
      sources[0]
    );
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const c = this._cfg;
    if (this._map) { this._map.remove(); this._map = null; }
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${BASE}/leaflet.css?v=1.9.4">
      <style>
        :host { --jm-teal: #00A9A5; --jm-dark: #003130; --jm-gold: #E3B84F; }
        ha-card { overflow: hidden; color: var(--primary-text-color); }
        /* the dark Surau pin needs a light halo on dark maps and cards */
        :host(.dark) .leaflet-marker-icon:not(.me-wrap), :host(.dark) .ic { filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff); }
        .head { display: flex; align-items: center; gap: 12px; padding: 14px 16px 6px; }
        .logo { width: 36px; height: 36px; border-radius: 10px; flex: none; }
        .who { min-width: 0; flex: 1; }
        .rf { flex: none; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--divider-color, #ddd); background: none;
          color: var(--primary-text-color); display: grid; place-items: center; cursor: pointer; padding: 0; }
        .rf:hover { background: var(--secondary-background-color, #f1f3f3); }
        .rf.spin svg { animation: jmspin .9s linear infinite; }
        @keyframes jmspin { to { transform: rotate(360deg); } }
        .ci { display: inline-flex; align-items: center; justify-content: center; gap: 5px; color: var(--jm-dark) !important; background: var(--jm-gold); }
        .row.top { flex-wrap: wrap; background: rgba(0,169,165,.08); border: 1px solid rgba(0,169,165,.35); border-radius: 14px;
          padding: 12px; margin: 6px 0 4px; }
        .act .g, .act .ci, .pop-act .g, .pop-act .ci { border: 1px solid transparent; }
        .act a, .pop-act a { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .row.top, .row.top:first-child { border: 1px solid rgba(0,169,165,.35); }
        .row.top + .row { border-top: 0; }
        .row.top .act { width: 100%; padding-left: 40px; }
        .row.top .act a { flex: 1; text-align: center; padding: 10px; }
        .tag { display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; color: var(--jm-teal); margin-bottom: 2px; }
        .tag.here { color: var(--jm-gold); }
        .pop-act { display: flex; gap: 8px; margin-top: 8px; }
        .pop-act a { box-sizing: border-box; flex: 1; text-align: center; font-weight: 600; text-decoration: none; border-radius: 8px; padding: 7px 8px; font-size: 12.5px; }
        .pop-act .m { color: #333; border: 1px solid #ccc; }
        .pop-act .g { color: #fff; background: var(--jm-teal); }
        .pop-act .jm { color: #fff; background: var(--jm-dark); }
        .pop-act .ci { flex: 0 0 100%; box-sizing: border-box; justify-content: center; }
        .pop-act { flex-wrap: wrap; }
        .pop-act a, .act a { white-space: nowrap; }
        .sheet { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; }
        .sheet .box { width: min(480px, 100%); padding: 0 8px calc(8px + env(safe-area-inset-bottom)); box-sizing: border-box; }
        .sheet .grp { background: rgba(250,250,250,.97); border-radius: 14px; overflow: hidden; margin-bottom: 8px; }
        .sheet .ttl { padding: 12px 16px; text-align: center; font-size: 13px; color: #8a8a8e; border-bottom: 1px solid #ddd; }
        .sheet a, .sheet button { display: block; width: 100%; padding: 16px; text-align: center; font: inherit; font-size: 19px; color: #007aff;
          text-decoration: none; background: none; border: 0; border-top: 1px solid #ddd; box-sizing: border-box; }
        .sheet .grp > :nth-child(2) { border-top: 0; }
        .sheet button { font-weight: 600; border: 0; }
        .pop-here { display: inline-block; font-size: 11px; font-weight: 700; color: #8a6a10; background: #fbefc9; border-radius: 6px; padding: 1px 6px; margin-top: 4px; }
        .who .lbl { font-size: 12px; color: var(--secondary-text-color); }
        .who .name { color: var(--primary-text-color); font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bar { padding: 4px 16px 0; }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .chips button { border: 1px solid var(--divider-color, #ddd); border-radius: 16px; padding: 4px 12px; font: inherit; font-size: 12px;
          cursor: pointer; background: none; color: var(--primary-text-color); }
        .chips button.on { background: var(--jm-teal); color: #fff; border-color: transparent; }
        .seg { display: flex; background: var(--secondary-background-color, #f1f3f3); border-radius: 12px; padding: 3px; }
        .seg button { flex: 1; border: 0; background: none; border-radius: 9px; padding: 7px 4px; font: inherit; font-size: 12.5px; font-weight: 600;
          color: var(--secondary-text-color); cursor: pointer; white-space: nowrap; }
        .seg button.on { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
        .seg .n { font-weight: 500; opacity: .7; margin-left: 3px; }
        .map { height: ${Number(c.map_height)}px; margin: 10px 0 0; position: relative; z-index: 0; }
        .map.hidden { display: none; }
        .leaflet-container { background: var(--secondary-background-color, #eee); font: inherit; }
        :host(.dark) .leaflet-tile-pane { filter: invert(.9) hue-rotate(180deg) brightness(1.1) contrast(1.1) saturate(.35); }
        :host(.dark) .leaflet-control-attribution, :host(.dark) .leaflet-bar a { background: #222; color: #ccc; }
        .loc a { display: flex; align-items: center; justify-content: center; }
        .leaflet-popup-content { margin: 10px 12px; font-size: 13px; line-height: 1.45; }
        .leaflet-popup-content b { font-size: 14px; }
        .me { width: 16px; height: 16px; border-radius: 50%; background: var(--primary-color, #03a9f4); border: 3px solid #fff;
          box-shadow: 0 0 0 6px rgba(3,169,244,.25); box-sizing: border-box; }
        .list { padding: 4px 16px 12px; }
        .row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--divider-color, #e0e0e0); }
        .row:first-child { border-top: 0; }
        .ic { width: 30px; height: 30px; flex: none; }
        .mid { flex: 1; min-width: 0; }
        .mid .nm { color: var(--primary-text-color); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mid .sub { font-size: 12px; color: var(--secondary-text-color); }
        .act { display: flex; gap: 6px; }
        .act a { font-size: 12px; font-weight: 600; line-height: 1; text-decoration: none; border-radius: 8px; padding: 8px 10px; white-space: nowrap; }
        .act .m { color: var(--primary-text-color); border: 1px solid var(--divider-color, #ddd); }
        .act .g { color: #fff; background: var(--jm-teal); }
        .empty { padding: 14px 0; text-align: center; color: var(--secondary-text-color); font-size: 13px; }
        .foot { font-size: 11px; color: var(--secondary-text-color); padding: 0 16px 10px; display: flex; justify-content: space-between; }
      </style>
      <ha-card>
        <div class="head"><img class="logo" src="${IMG("brandicon")}" alt="">
          <div class="who"><div class="lbl" id="lbl"></div><div class="name" id="name"></div></div>
          <button class="rf" id="rf" title="Refresh">${ICON_REFRESH}</button></div>
        <div class="bar"><div class="chips" id="chips"></div><div class="seg" id="seg"></div></div>
        <div class="map ${c.show_map ? "" : "hidden"}" id="map"></div>
        <div class="list" id="list"></div>
        <div class="foot" id="foot"></div>
      </ha-card>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("seg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this._filter = b.dataset.f; this._userInteracted = false; this._stamp = null; this._render(); }
    });
    $("chips").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this._source = b.dataset.s; this._userInteracted = false; this._stamp = null; this._render(); }
    });
    $("rf").addEventListener("click", () => this._refresh());
    this.shadowRoot.addEventListener("click", (e) => {
      const c = e.target.closest("a.ci");
      if (c) { e.preventDefault(); openCheckin(c.getAttribute("href")); }
    });
    if (IS_IOS) this.shadowRoot.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-nav]");
      if (a) { e.preventDefault(); this._sheet(a.dataset.nav); }
    });
    this._built = true;
    this._userInteracted = false;
    if (c.show_map) this._ready = loadLeaflet().then((L) => this._initMap(L)).catch(() => { $("map").classList.add("hidden"); });
  }

  // Re-run the search for the selected person or Home right now, then re-centre the map.
  async _refresh() {
    const b = this.shadowRoot.getElementById("rf");
    if (!this._cur || b.classList.contains("spin")) return;
    b.classList.add("spin");
    try {
      await this._hass.callService("homeassistant", "update_entity", { entity_id: this._cur.id });
    } finally {
      this._userInteracted = false; this._stamp = null;
      setTimeout(() => { b.classList.remove("spin"); this._render(); }, 800);
    }
  }

  _sheet(id) {
    const p = (this._shown || []).find((x) => String(x.id) === id);
    if (!p) return;
    const el = document.createElement("div");
    el.className = "sheet";
    el.innerHTML = `<div class="box"><div class="grp"><div class="ttl">${esc(nice(p.name))}</div>${iosApps(p)
      .map((a) => `<a href="${esc(a.u)}">${esc(a.n)}</a>`).join("")}</div><div class="grp"><button>${this._lang === "ms" ? "Batal" : "Cancel"}</button></div></div>`;
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("button") || e.target.closest("a")) setTimeout(() => el.remove(), 50); });
    this.shadowRoot.appendChild(el);
  }

  // Close enough to the place to check in (live distance from the person, not the search point).
  _atPlace(p) {
    const o = this._cur?.origin;
    return !!(o && this._cfg.show_checkin && this._cur.src !== "zone.home" && distM(o, [p.latitude, p.longitude]) <= Number(this._cfg.checkin_radius_m));
  }

  _initMap(L) {
    const el = this.shadowRoot.getElementById("map");
    if (!el || this._map) return;
    this._L = L;
    this._userInteracted = false;
    this._map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    this._map.setView([this._hass.config.latitude || 3.139, this._hass.config.longitude || 101.6869], 14);
    this._tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      // HA pages send no Referer, and OSM blocks tiles without one (403): same fix as the Rapid Bus and Air Quality cards.
      referrerPolicy: "strict-origin-when-cross-origin",
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Jejak Masjid',
    }).addTo(this._map);
    this._layer = L.layerGroup().addTo(this._map);

    this._map.on("dragstart", () => { this._userInteracted = true; });
    this._map.on("zoomstart", (e) => { if (e && e.originalEvent) this._userInteracted = true; });

    // "My location" button under the zoom buttons: re-centres on the selected person (or Home).
    const Locate = L.Control.extend({
      options: { position: "topleft" },
      onAdd: () => {
        const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control loc");
        const a = L.DomUtil.create("a", "", bar);
        a.href = "#"; a.role = "button";
        a.title = a.ariaLabel = this._lang === "ms" ? "Lokasi semasa" : "Current location";
        a.innerHTML = ICON_LOCATE;
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(a, "click", (e) => {
          L.DomEvent.preventDefault(e);
          this._userInteracted = false;
          const o = this._cur?.origin;
          if (o) {
            this._map.setView(o, Math.max(this._map.getZoom(), 16));
          } else {
            this._fitOrCenter(true);
          }
        });
        return bar;
      },
    });
    new Locate().addTo(this._map);

    this._lastW = 0;
    this._lastH = 0;
    this._ro = new ResizeObserver(() => {
      if (!this._map || !el.clientWidth || !el.clientHeight) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (Math.abs(w - this._lastW) > 2 || Math.abs(h - this._lastH) > 2) {
        this._lastW = w;
        this._lastH = h;
        this._map._sizeChanged = true;
        this._map.invalidateSize({ pan: false });
        if (!this._userInteracted) this._fitOrCenter();
      }
    });
    this._ro.observe(el);

    // Invalidate and fit once card styles and layout settle
    setTimeout(() => {
      if (!this._map) return;
      this._map._sizeChanged = true;
      this._map.invalidateSize({ pan: false });
      if (!this._userInteracted) this._fitOrCenter();
    }, 150);
    setTimeout(() => {
      if (!this._map) return;
      this._map._sizeChanged = true;
      this._map.invalidateSize({ pan: false });
      if (!this._userInteracted) this._fitOrCenter();
    }, 450);

    this._drawMap();
  }

  _render() {
    if (!this._hass) return;
    let sources = this._sources();
    const stamp = sources.map((s) => s.st.last_updated).join("|") + this._filter + this._source + this._lang + this._dark;
    if (this._built && stamp === this._stamp) return;
    this._stamp = stamp;
    if (!this._built) this._build();
    this.classList.toggle("dark", this._dark);

    const t = T[this._lang];
    const $ = (id) => this.shadowRoot.getElementById(id);
    if (!sources.length) {
      $("name").textContent = this._cfg.title || "Jejak Masjid";
      $("lbl").textContent = "";
      $("list").innerHTML = `<div class="empty">${t.noData}</div>`;
      return;
    }
    // Chips: only the viewer's own person, Home, and the sensor picked in the config,
    // so a house with many HA users doesn't get a long row of names.
    const want = this._wanted(sources);
    const mine = (s) => s.src === "zone.home" || s.id === want || (s.user && s.user === this._hass.user?.id);
    const all = sources;
    sources = all.filter(mine);
    if (!sources.length) sources = all.slice(0, 1);
    let cur = sources.find((s) => s.id === this._source);
    if (!cur) { cur = this._defaultSource(sources); this._source = cur.id; this._userInteracted = false; }

    const places = cur.st.attributes.nearby.map((p) => ({ ...p, g: group(p.type) }));
    const counts = { all: places.length, masjid: 0, surau: 0, other: 0 };
    places.forEach((p) => counts[p.g]++);
    const shown = places.filter((p) => this._filter === "all" || p.g === this._filter);
    const radius = cur.st.attributes.radius_km;

    $("lbl").textContent = this._cfg.title || "Jejak Masjid";
    $("name").textContent = cur.who;
    const chips = $("chips");
    chips.style.display = this._cfg.show_people && sources.length > 1 ? "" : "none";
    chips.innerHTML = sources.map((s) => `<button class="${s.id === cur.id ? "on" : ""}" data-s="${s.id}">${esc(s.who)}</button>`).join("");
    $("seg").innerHTML = FILTERS.map(
      (f) => `<button class="${f === this._filter ? "on" : ""}" data-f="${f}">${f === "all" ? t.all : TYPES[f][this._lang]}<span class="n">${counts[f]}</span></button>`
    ).join("");

    this._cur = cur;
    const escRadius = esc(radius);
    $("list").innerHTML = !places.length
      ? `<div class="empty">${t.empty} ${escRadius} km.</div>`
      : shown.length
        ? shown.slice(0, this._cfg.max_items).map((p, i) => {
            const top = i === 0;
            const here = this._atPlace(p);
            const validUrl = safeHttpUrl(p.url);
            const ci = esc(checkinUrl(this._cfg.checkin_uri, p));
            return `<div class="row${top ? " top" : ""}">
            <img class="ic" src="${IMG("marker-" + p.g)}" alt="">
            <div class="mid">${top ? `<div class="tag${here ? " here" : ""}">${here ? t.here : t.nearest}</div>` : ""}<div class="nm">${validUrl ? `<a href="${esc(validUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${esc(nice(p.name))}</a>` : esc(nice(p.name))}</div><div class="sub">${fmtDist(p)} · ${TYPES[p.g][this._lang]}</div></div>
            <div class="act">${top && here ? `<a class="ci" href="${ci}">${ICON_PIN}${t.checkin}</a>` : ""}<a class="m" href="${mapsUrl(p)}" target="_blank" rel="noopener">${t.maps}</a><a class="g" href="${navUrl(p)}" target="${navTarget()}" data-nav="${esc(p.id)}" rel="noopener">${t.go}</a></div>
          </div>`;
          }).join("")
        : `<div class="empty">${t.none}</div>`;

    const fetched = cur.st.attributes.fetched ? new Date(cur.st.attributes.fetched) : null;
    $("foot").innerHTML = `<span>${places.length} ${t.places} ${t.within} ${escRadius} km</span><span>${
      fetched ? fetched.toLocaleString(this._lang === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}</span>`;

    this._cur = cur;
    this._shown = shown;
    if (this._map) this._drawMap();
  }

  _popup(p) {
    const t = T[this._lang];
    const here = this._atPlace(p);
    const validUrl = safeHttpUrl(p.url);
    const ci = esc(checkinUrl(this._cfg.checkin_uri, p));
    return `<b>${validUrl ? `<a href="${esc(validUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${esc(nice(p.name))}</a>` : esc(nice(p.name))}</b><br>${fmtDist(p)} · ${TYPES[p.g][this._lang]}${here ? `<br><span class="pop-here">${t.here}</span>` : ""}
      <div class="pop-act">${here ? `<a class="ci" href="${ci}">${ICON_PIN}${t.checkin}</a>` : ""}
      ${validUrl ? `<a class="jm" href="${esc(validUrl)}" target="_blank" rel="noopener noreferrer">${t.info}</a>` : ""}
      <a class="m" href="${mapsUrl(p)}" target="_blank" rel="noopener">${t.maps}</a><a class="g" href="${navUrl(p)}" target="${navTarget()}" data-nav="${esc(p.id)}" rel="noopener">${t.go}</a></div>`;
  }

  _fitOrCenter(force = false) {
    if (!this._map || !this._cur) return;
    if (this._userInteracted && !force) return;
    const pts = [];
    for (const p of this._shown || []) pts.push([p.latitude, p.longitude]);
    if (this._cur.origin) pts.push(this._cur.origin);
    const box = this._map.getContainer();
    if (!box || box.clientWidth <= 0 || box.clientHeight <= 0) return;
    this._map._sizeChanged = true;
    if (pts.length === 1) {
      this._map.setView(pts[0], 15);
    } else if (pts.length > 1) {
      this._map.fitBounds(pts, { padding: [28, 28], maxZoom: 16 });
    } else if (this._cur.origin) {
      this._map.setView(this._cur.origin, 15);
    }
  }

  _drawMap() {
    const L = this._L;
    const cur = this._cur;
    if (!L || !this._map || !cur) return;
    this._layer.clearLayers();
    for (const p of this._shown || []) {
      const icon = L.icon({ iconUrl: IMG("marker-" + p.g), iconSize: [30, 30], iconAnchor: [15, 29], popupAnchor: [0, -26] });
      L.marker([p.latitude, p.longitude], { icon })
        .bindPopup(this._popup(p), { minWidth: 220 })
        .addTo(this._layer);
    }
    if (cur.origin) {
      L.marker(cur.origin, { icon: L.divIcon({ className: "me-wrap", html: '<div class="me"></div>', iconSize: [16, 16] }), zIndexOffset: 1000, interactive: false }).addTo(this._layer);
    }
    if (!this._userInteracted) this._fitOrCenter();
  }
}

class JejakMasjidCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._draw(); }
  set hass(hass) { this._hass = hass; this._draw(); }
  _draw() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => ({
        person: "Person (blank = whoever is viewing)", title: "Heading label", filter: "Default filter", show_people: "Show people chips",
        show_map: "Show map", map_height: "Map height (px)", max_items: "Places in list", dark_tiles: "Map style", language: "Language",
        show_checkin: "Enable Check in (Jejak Masjid app)", checkin_radius_m: "Check-in distance (m)", checkin_uri: "Check-in link",
      }[s.name] || s.name);
      this._form.addEventListener("value-changed", (ev) => {
        const v = { ...ev.detail.value };
        delete v.entity; // replaced by person
        if (!v.person) delete v.person;
        this._config = v;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    // People who have a Jejak Masjid "nearest" sensor (the integration skips anyone without GPS).
    const tracked = Object.values(this._hass.states)
      .filter((st) => st.entity_id.startsWith("sensor.") && Array.isArray(st.attributes.nearby) && String(st.attributes.source || "").startsWith("person."))
      .map((st) => st.attributes.source);
    // Older configs named a sensor; show it as its person.
    const e = this._config.entity || "";
    const legacy = e.startsWith("person.") ? e : this._hass.states[e]?.attributes.source;
    const person = this._config.person || (String(legacy || "").startsWith("person.") ? legacy : undefined);
    this._form.data = { filter: "all", show_people: true, show_map: true, map_height: 360, max_items: 8, dark_tiles: "auto", language: "auto",
      show_checkin: true, checkin_radius_m: 50, checkin_uri: DEFAULT_CHECKIN_URI, ...this._config, person };
    this._form.schema = [
      { name: "person", selector: { entity: tracked.length ? { domain: "person", include_entities: [...new Set(tracked)] } : { domain: "person" } } },
      { name: "filter", selector: { select: { mode: "dropdown", options: [
        { value: "all", label: "All" }, { value: "masjid", label: "Masjid" }, { value: "surau", label: "Surau" }, { value: "other", label: "Others" }] } } },
      { type: "grid", name: "", schema: [
        { name: "show_people", selector: { boolean: {} } },
        { name: "show_map", selector: { boolean: {} } },
        { name: "map_height", selector: { number: { min: 150, max: 700, step: 10, mode: "box" } } },
        { name: "max_items", selector: { number: { min: 1, max: 30, mode: "box" } } },
        { name: "dark_tiles", selector: { select: { mode: "dropdown", options: [
          { value: "auto", label: "Follow theme" }, { value: "true", label: "Always dark" }, { value: "false", label: "Always light" }] } } },
        { name: "language", selector: { select: { mode: "dropdown", options: [
          { value: "auto", label: "Follow HA" }, { value: "en", label: "English" }, { value: "ms", label: "Bahasa Melayu" }] } } },
      ] },
      { name: "show_checkin", selector: { boolean: {} } },
      ...(this._form.data.show_checkin === false ? [] : [
        { name: "checkin_radius_m", selector: { number: { min: 10, max: 300, step: 5, mode: "box" } } },
        { name: "checkin_uri", selector: { text: {} } },
      ]),
      { name: "title", selector: { text: {} } },
    ];
  }
}

if (!customElements.get("jejakmasjid-card")) customElements.define("jejakmasjid-card", JejakMasjidCard);
if (!customElements.get("jejakmasjid-card-editor")) customElements.define("jejakmasjid-card-editor", JejakMasjidCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "jejakmasjid-card")) {
  window.customCards.push({
    type: "jejakmasjid-card", name: "Jejak Masjid", preview: true,
    description: "Nearby masjid and surau on a map, with a type filter, navigation and check-in to the Jejak Masjid app.",
    documentationURL: "https://github.com/zubir2k/homeassistant-jejakmasjid",
  });
}
// Self-heal: if the dashboard drew before this script loaded, HA left an error tile
// in our place and doesn't always redraw it. Find those tiles and ask HA to rebuild them.
function healErrorCards() {
  const found = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      const tag = el.localName;
      if (tag === "hui-error-card") {
        const cfg = el._config || el.config;
        if (cfg?.origConfig?.type === CARD_TYPE) found.push(el);
      } else if (tag === "hui-card") {
        const el2 = el.shadowRoot?.firstElementChild || el.firstElementChild;
        if (el.config?.type === CARD_TYPE && el2 && el2.localName === "hui-error-card") found.push(el2);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  try { walk(document); } catch (e) { /* never break the dashboard */ }
  for (const el of new Set(found)) el.dispatchEvent(new Event("ll-rebuild", { bubbles: true, composed: true }));
  return found.length;
}
[0, 1000, 3000, 8000].forEach((ms) => setTimeout(healErrorCards, ms));
console.info(`%c JEJAKMASJID-CARD %c ${VERSION} `, "background:#00A9A5;color:#fff;font-weight:700", "background:#003130;color:#fff");
