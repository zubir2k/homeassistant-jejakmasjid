// Jejak Masjid stats card: one person's journey stats from a linked Jejak Masjid account.
const BASE = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const PRAYERS = ["subuh", "zohor", "asar", "maghrib", "isyak"];
const T = {
  en: { glance: "Journey at a glance", masjids: "Masjids visited", checkins: "Check-ins", streak: "Current streak", points: "Points",
    days: (n) => `${n} ${n === 1 ? "day" : "days"}`, month: "this month", longest: "longest", rank: "Global rank", monthly: "Monthly",
    achievements: "achievements", prayers: "Prayer streaks", last: "Last visit", none: "No Jejak Masjid account is linked for this person. Link one in the Jejak Masjid integration options.",
    pick: "Pick a person in the card settings." },
  ms: { glance: "Ringkasan perjalanan", masjids: "Masjid dilawati", checkins: "Daftar masuk", streak: "Streak semasa", points: "Mata",
    days: (n) => `${n} hari`, month: "bulan ini", longest: "terpanjang", rank: "Kedudukan global", monthly: "Bulanan",
    achievements: "pencapaian", prayers: "Streak solat", last: "Lawatan terakhir", none: "Tiada akaun Jejak Masjid dipautkan untuk orang ini. Pautkan di pilihan integrasi Jejak Masjid.",
    pick: "Pilih orang dalam tetapan kad." },
};
const PRAYER_NAMES = { subuh: "Subuh", zohor: "Zohor", asar: "Asar", maghrib: "Maghrib", isyak: "Isyak" };
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => (v === null || v === undefined || v === "unknown" || v === "unavailable" ? "–" : Number(v).toLocaleString());

class JejakMasjidStatsCard extends HTMLElement {
  setConfig(config) {
    this._cfg = { show_prayers: true, show_rank: true, compact: false, language: "auto", ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._key = null;
    if (this._hass) this._render();
  }
  static getStubConfig(hass) {
    const st = Object.values(hass?.states || {}).find((s) => s.attributes?.stat === "checkins");
    return { person: st?.attributes.person || "" };
  }
  static getConfigElement() { return document.createElement("jejakmasjid-stats-card-editor"); }
  getCardSize() { return this._cfg?.compact ? 3 : 6; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }
  set hass(hass) { this._hass = hass; if (this._cfg) this._render(); }

  get _t() {
    const l = this._cfg.language === "auto" ? (this._hass.locale?.language || this._hass.language || "en") : this._cfg.language;
    return T[String(l).startsWith("ms") ? "ms" : "en"];
  }

  _stats() {
    const out = {};
    const who = this._cfg.person || "";
    for (const st of Object.values(this._hass.states)) {
      const a = st.attributes || {};
      if (a.stat && (a.person || "") === who && st.entity_id.startsWith("sensor.")) out[a.stat] = st;
    }
    return out;
  }

  _render() {
    const s = this._stats();
    const person = this._cfg.person ? this._hass.states[this._cfg.person] : null;
    const key = JSON.stringify([this._cfg, person?.attributes.entity_picture, person?.attributes.friendly_name, this._hass.locale?.language,
      Object.values(s).map((x) => [x.state, x.last_changed, x.attributes])]);
    if (key === this._key) return;
    this._key = key;
    const t = this._t;
    let body;
    if (!s.checkins) {
      body = `<div class="note">${esc(this._cfg.person ? t.none : t.pick)}</div>`;
    } else {
      const v = (k) => s[k]?.state;
      const a = (k, n) => s[k]?.attributes?.[n];
      const tile = (k, label, value, sub) => `<button class="tile" data-e="${esc(s[k]?.entity_id)}">
        <div class="val">${value}</div><div class="lbl">${esc(label)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</button>`;
      const streak = Number(v("streak"));
      const grid = `<div class="grid">
        ${tile("masjids", t.masjids, num(v("masjids")), a("masjids", "this_month") != null ? `${num(a("masjids", "this_month"))} ${t.month}` : "")}
        ${tile("checkins", t.checkins, num(v("checkins")), a("checkins", "this_month") != null ? `${num(a("checkins", "this_month"))} ${t.month}` : "")}
        ${tile("streak", t.streak, Number.isFinite(streak) ? esc(t.days(streak)) : "–", a("streak", "longest") != null ? `${t.longest} ${t.days(a("streak", "longest"))}` : "")}
        ${tile("points", t.points, num(v("points")), a("points", "this_month") != null ? `${num(a("points", "this_month"))} ${t.month}` : "")}
      </div>`;
      const rank = this._cfg.show_rank && !this._cfg.compact ? `<div class="row">
        <button class="pill" data-e="${esc(s.rank?.entity_id)}">${esc(t.rank)} <b>#${num(v("rank"))}</b>${a("rank", "monthly_rank") != null ? ` · ${esc(t.monthly)} <b>#${num(a("rank", "monthly_rank"))}</b>` : ""}</button>
        <button class="pill" data-e="${esc(s.achievements?.entity_id)}"><b>${num(v("achievements"))}</b> ${esc(t.achievements)}</button></div>` : "";
      const prayers = this._cfg.show_prayers && !this._cfg.compact ? `<div class="sect">${esc(t.prayers)}</div><div class="prayers">
        ${PRAYERS.map((p) => { const n = Number(a("streak", `${p}_streak`) || 0);
          return `<div class="chip ${n > 0 ? "on" : ""}"><span>${PRAYER_NAMES[p]}</span><b>${n}</b></div>`; }).join("")}</div>` : "";
      body = `<div class="sect">${esc(t.glance)}</div>${grid}${rank}${prayers}`;
    }
    const name = person?.attributes.friendly_name || this._cfg.person || "Jejak Masjid";
    const pic = person?.attributes.entity_picture;
    const last = s.checkins?.attributes?.last_visit;
    const lastTxt = last ? new Date(`${last}T00:00:00`).toLocaleDateString(this._hass.locale?.language || undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    this.shadowRoot.innerHTML = `<style>
      ha-card{padding:16px;overflow:hidden}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
      .av{width:48px;height:48px;border-radius:12px;object-fit:cover;background:var(--secondary-background-color);flex:none;
        display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px;color:var(--primary-text-color)}
      .who{flex:1;min-width:0}.nm{font-size:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lv{font-size:13px;color:var(--secondary-text-color)}
      .brand{width:28px;height:28px;opacity:.9}
      .sect{font-size:13px;font-weight:600;color:var(--secondary-text-color);margin:12px 0 8px;text-transform:uppercase;letter-spacing:.04em}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .tile,.pill{font:inherit;color:inherit;text-align:left;cursor:pointer;border:1px solid var(--divider-color);
        background:var(--secondary-background-color);border-radius:12px}
      .tile{padding:12px}.val{font-size:24px;font-weight:700;line-height:1.2}
      .lbl{font-size:13px;color:var(--secondary-text-color);margin-top:2px}.sub{font-size:12px;color:var(--secondary-text-color);opacity:.8}
      .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.pill{padding:8px 12px;font-size:13px}
      .prayers{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
      .chip{display:flex;flex-direction:column;align-items:center;padding:8px 2px;border-radius:10px;font-size:12px;
        border:1px solid var(--divider-color);color:var(--secondary-text-color)}
      .chip b{font-size:16px;color:var(--primary-text-color)}
      .chip.on{background:rgba(var(--rgb-primary-color,3,169,244),.15);border-color:var(--primary-color)}
      .chip.on b{color:var(--primary-color)}
      .note{color:var(--secondary-text-color);font-size:14px;padding:8px 0}
    </style><ha-card><div class="head">
      ${pic ? `<img class="av" src="${esc(pic)}" alt="">` : `<div class="av">${esc(String(name).charAt(0))}</div>`}
      <div class="who"><div class="nm">${esc(name)}</div>${lastTxt ? `<div class="lv">${esc(t.last)} ${esc(lastTxt)}</div>` : ""}</div>
      <img class="brand" src="${BASE}/img/brandicon.png" alt="Jejak Masjid"></div>${body}</ha-card>`;
    this.shadowRoot.querySelectorAll("[data-e]").forEach((el) => el.addEventListener("click", () => {
      if (!el.dataset.e) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: el.dataset.e }, bubbles: true, composed: true }));
    }));
  }
}

class JejakMasjidStatsCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._draw(); }
  set hass(hass) { this._hass = hass; this._draw(); }
  _draw() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => ({ person: "Person (with a linked account)", show_prayers: "Show prayer streaks",
        show_rank: "Show rank and achievements", compact: "Compact (stats grid only)", language: "Language" }[s.name] || s.name);
      this._form.addEventListener("value-changed", (ev) => {
        this._config = { ...ev.detail.value };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const linked = [...new Set(Object.values(this._hass.states).map((s) => s.attributes?.person).filter((p) => s_ok(p)))];
    function s_ok(p) { return typeof p === "string" && p.startsWith("person."); }
    this._form.hass = this._hass;
    this._form.data = { show_prayers: true, show_rank: true, compact: false, language: "auto", ...this._config };
    this._form.schema = [
      { name: "person", required: true, selector: { entity: linked.length ? { domain: "person", include_entities: linked } : { domain: "person" } } },
      { type: "grid", name: "", schema: [
        { name: "show_prayers", selector: { boolean: {} } },
        { name: "show_rank", selector: { boolean: {} } },
        { name: "compact", selector: { boolean: {} } },
        { name: "language", selector: { select: { mode: "dropdown", options: [
          { value: "auto", label: "Follow HA" }, { value: "en", label: "English" }, { value: "ms", label: "Bahasa Melayu" }] } } },
      ] },
    ];
  }
}

if (!customElements.get("jejakmasjid-stats-card")) customElements.define("jejakmasjid-stats-card", JejakMasjidStatsCard);
if (!customElements.get("jejakmasjid-stats-card-editor")) customElements.define("jejakmasjid-stats-card-editor", JejakMasjidStatsCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "jejakmasjid-stats-card")) {
  window.customCards.push({
    type: "jejakmasjid-stats-card", name: "Jejak Masjid Stats", preview: true,
    description: "Your Jejak Masjid journey: masjids visited, check-ins, streaks, points and rank (needs a linked account).",
    documentationURL: "https://github.com/zubir2k/homeassistant-jejakmasjid",
  });
}
