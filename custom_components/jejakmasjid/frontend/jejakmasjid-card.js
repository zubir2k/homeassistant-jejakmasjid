/*
 * jejakmasjid-card: nearby masjid and surau for each tracked person (and Home) on a map,
 * with a type filter and Google Maps / navigation links.
 * Ships inside custom_components/jejakmasjid and is loaded automatically.
 * Map: Leaflet 1.9.4 (BSD-2) with OpenStreetMap tiles. Logo and marker art: Jejak Masjid's own.
 */
const BASE = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";
const CARD_TYPE = "custom:jejakmasjid-card";

const TYPES = {
  masjid: { en: "Masjid", ms: "Masjid", color: "#00A9A5" },
  surau: { en: "Surau", ms: "Surau", color: "#003130" },
  other: { en: "Others", ms: "Lain-lain", color: "#E3B84F" },
};
const FILTERS = ["all", "masjid", "surau", "other"];
const T = {
  en: { all: "All", within: "within", places: "places", none: "Nothing of this type nearby.", maps: "Maps", go: "Navigate",
        home: "Home", noData: "No Jejak Masjid sensors yet. Add the Jejak Masjid integration first.", empty: "No masjid or surau found within" },
  ms: { all: "Semua", within: "dalam", places: "tempat", none: "Tiada tempat jenis ini berdekatan.", maps: "Peta", go: "Navigasi",
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
const mapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
const navUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=driving`;
// Many names are ALL CAPS; show them in title case
const nice = (n) => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s\-(\/'])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : n);
const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

class JejakMasjidCard extends HTMLElement {
  setConfig(config) {
    this._cfg = {
      show_map: true, map_height: 260, max_items: 8, filter: "all",
      show_people: true, dark_tiles: "auto", language: "auto",
      ...config,
    };
    this._filter = FILTERS.includes(this._cfg.filter) ? this._cfg.filter : "all";
    this._source = this._cfg.entity || null;
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

  // Start on the configured sensor, else whoever is looking at the dashboard, else Home.
  _defaultSource(sources) {
    return (
      sources.find((s) => s.id === this._cfg.entity) ||
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
        .who { min-width: 0; }
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
          <div class="who"><div class="lbl" id="lbl"></div><div class="name" id="name"></div></div></div>
        <div class="bar"><div class="chips" id="chips"></div><div class="seg" id="seg"></div></div>
        <div class="map ${c.show_map ? "" : "hidden"}" id="map"></div>
        <div class="list" id="list"></div>
        <div class="foot" id="foot"></div>
      </ha-card>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("seg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this._filter = b.dataset.f; this._fitted = false; this._stamp = null; this._render(); }
    });
    $("chips").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { this._source = b.dataset.s; this._fitted = false; this._stamp = null; this._render(); }
    });
    this._built = true;
    this._fitted = false;
    if (c.show_map) this._ready = loadLeaflet().then((L) => this._initMap(L)).catch(() => { $("map").classList.add("hidden"); });
  }

  _initMap(L) {
    const el = this.shadowRoot.getElementById("map");
    if (!el || this._map) return;
    this._L = L;
    this._map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    this._map.setView([this._hass.config.latitude || 3.139, this._hass.config.longitude || 101.6869], 14);
    this._tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      // HA pages send no Referer, and OSM blocks tiles without one (403): same fix as the Rapid Bus and Air Quality cards.
      referrerPolicy: "strict-origin-when-cross-origin",
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Jejak Masjid',
    }).addTo(this._map);
    this._layer = L.layerGroup().addTo(this._map);
    new ResizeObserver(() => {
      if (!this._map || !el.clientWidth || !el.clientHeight) return;
      // Leaflet caches the size it was created at (often 0 in the editor preview).
      this._map._sizeChanged = true;
      this._map.invalidateSize();
      if (!this._fitted) this._drawMap();
    }).observe(el);
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
    const mine = (s) => s.src === "zone.home" || s.id === this._cfg.entity || (s.user && s.user === this._hass.user?.id);
    const all = sources;
    sources = all.filter(mine);
    if (!sources.length) sources = all.slice(0, 1);
    let cur = sources.find((s) => s.id === this._source);
    if (!cur) { cur = this._defaultSource(sources); this._source = cur.id; this._fitted = false; }

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

    $("list").innerHTML = !places.length
      ? `<div class="empty">${t.empty} ${radius} km.</div>`
      : shown.length
        ? shown.slice(0, this._cfg.max_items).map((p) => `<div class="row">
            <img class="ic" src="${IMG("marker-" + p.g)}" alt="">
            <div class="mid"><div class="nm">${esc(nice(p.name))}</div><div class="sub">${fmtKm(p.distance_km)} · ${TYPES[p.g][this._lang]}</div></div>
            <div class="act"><a class="m" href="${mapsUrl(p)}" target="_blank" rel="noopener">${t.maps}</a><a class="g" href="${navUrl(p)}" target="_blank" rel="noopener">${t.go}</a></div>
          </div>`).join("")
        : `<div class="empty">${t.none}</div>`;

    const fetched = cur.st.attributes.fetched ? new Date(cur.st.attributes.fetched) : null;
    $("foot").innerHTML = `<span>${places.length} ${t.places} ${t.within} ${radius} km</span><span>${
      fetched ? fetched.toLocaleString(this._lang === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}</span>`;

    this._cur = cur;
    this._shown = shown;
    if (this._map) this._drawMap();
  }

  _drawMap() {
    const L = this._L;
    const cur = this._cur;
    if (!L || !this._map || !cur) return;
    this._layer.clearLayers();
    const pts = [];
    for (const p of this._shown || []) {
      const icon = L.icon({ iconUrl: IMG("marker-" + p.g), iconSize: [30, 30], iconAnchor: [15, 29], popupAnchor: [0, -26] });
      L.marker([p.latitude, p.longitude], { icon })
        .bindPopup(`<b>${esc(nice(p.name))}</b><br>${fmtKm(p.distance_km)} · ${TYPES[p.g][this._lang]}<br>
          <a href="${mapsUrl(p)}" target="_blank" rel="noopener">${T[this._lang].maps}</a> · <a href="${navUrl(p)}" target="_blank" rel="noopener">${T[this._lang].go}</a>`)
        .addTo(this._layer);
      pts.push([p.latitude, p.longitude]);
    }
    if (cur.origin) {
      L.marker(cur.origin, { icon: L.divIcon({ className: "me-wrap", html: '<div class="me"></div>', iconSize: [16, 16] }), zIndexOffset: 1000, interactive: false }).addTo(this._layer);
      pts.push(cur.origin);
    }
    const box = this._map.getContainer();
    if (!this._fitted && pts.length && box.clientWidth > 0 && box.clientHeight > 0) {
      this._map._sizeChanged = true;
      if (pts.length === 1) this._map.setView(pts[0], 15);
      else this._map.fitBounds(pts, { padding: [28, 28], maxZoom: 16 });
      this._fitted = true;
    }
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
        entity: "Extra place to show (blank = just you and Home)", title: "Heading label", filter: "Default filter", show_people: "Show people chips",
        show_map: "Show map", map_height: "Map height (px)", max_items: "Places in list", dark_tiles: "Map style", language: "Language",
      }[s.name] || s.name);
      this._form.addEventListener("value-changed", (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { filter: "all", show_people: true, show_map: true, map_height: 260, max_items: 8, dark_tiles: "auto", language: "auto", ...this._config };
    this._form.schema = [
      { name: "entity", selector: { entity: { integration: "jejakmasjid", domain: "sensor" } } },
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
    description: "Nearby masjid and surau on a map, with a type filter and Google Maps navigation.",
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
