/**
 * Theme engine — four grounds × circadian daylight × contrast floor.
 * Ported from the design prototype; tokens land as CSS custom properties.
 * Persisted in localStorage; system preferences set the defaults.
 */

const K = ["table", "paper", "paperCool", "paperWarm", "surface", "ink", "ink2", "ink3", "line", "lineStrong"];
const MUTED = { working: "#d0b25c", session: "#97ab74", episodic: "#6c93a9", semantic: "#c2855b", preference: "#a67f9f", archive: "#948872" };
const VIVID = { working: "#e8c44e", session: "#6cc78a", episodic: "#5aa9d6", semantic: "#df8a78", preference: "#b389c4", archive: "#d99a6a" };
/* Plate minerals are the landing plate's strata fills, lifted for legibility
   at swatch size — the survey sheet and the control room use one palette. */
const PLATE_MIN = { working: "#c9a03a", session: "#58d68d", episodic: "#5a82a8", semantic: "#b8543f", preference: "#b4658c", archive: "#7e8894" };

const THEMES = {
  vellum: {
    day: { table: "#ddd9cf", paper: "#e9e6dd", paperCool: "#e3e2da", paperWarm: "#f0eee6", surface: "#f3f1ea", ink: "#2a2620", ink2: "#555047", ink3: "#777063", line: "#c9c4b6", lineStrong: "#b3ad9c", shadow: "rgba(40,34,26,.26)" },
    night: { table: "#cfc7b6", paper: "#dbd4c5", paperCool: "#d5cfc0", paperWarm: "#e4ddcd", surface: "#e9e3d4", ink: "#2b2620", ink2: "#564f43", ink3: "#7a715f", line: "#c2b9a4", lineStrong: "#ada28a", shadow: "rgba(26,20,12,.42)" },
    minerals: MUTED, accents: { intent: "#6c520f", verify: "#3f5a36", human: "#a23c27", explain: "#2f6088" }, humanFill: "#b5462f", humanInk: "#f6efe5",
    hc: { ink: "#161310", ink2: "#3b352a", line: "#9b927a", lineStrong: "#6f6754" },
  },
  stone: {
    day: { table: "#d3d4cf", paper: "#e4e5e1", paperCool: "#dcdeda", paperWarm: "#eceeea", surface: "#f0f1ee", ink: "#232624", ink2: "#4c504d", ink3: "#6c706c", line: "#c4c6c1", lineStrong: "#abada7", shadow: "rgba(28,30,28,.24)" },
    night: { table: "#c4c6c1", paper: "#d3d5d0", paperCool: "#cccfca", paperWarm: "#dddfda", surface: "#e3e5e0", ink: "#212422", ink2: "#494d4a", ink3: "#686c69", line: "#bbbdb7", lineStrong: "#a1a39d", shadow: "rgba(18,20,18,.4)" },
    minerals: MUTED, accents: { intent: "#675210", verify: "#3e5836", human: "#9c3d29", explain: "#2d5f84" }, humanFill: "#b0432d", humanInk: "#f6efe5",
    hc: { ink: "#141614", ink2: "#393c39", line: "#969890", lineStrong: "#6c6e68" },
  },
  nocturne: {
    day: { table: "#2b2922", paper: "#312e27", paperCool: "#36332b", paperWarm: "#3a362e", surface: "#3f3b32", ink: "#ede7d9", ink2: "#bab2a1", ink3: "#8f897a", line: "#46423a", lineStrong: "#585348", shadow: "rgba(0,0,0,.5)" },
    night: { table: "#1e1c18", paper: "#24221c", paperCool: "#292620", paperWarm: "#2c2922", surface: "#302c25", ink: "#ece6d7", ink2: "#b4ad9b", ink3: "#8a8474", line: "#3b3830", lineStrong: "#4d4940", shadow: "rgba(0,0,0,.62)" },
    minerals: MUTED, accents: { intent: "#e0b84e", verify: "#94b07f", human: "#e89674", explain: "#74b6e6" }, humanFill: "#b5462f", humanInk: "#f6efe5",
    hc: { ink: "#f8f3e9", ink2: "#d2cbba", line: "#5a564c", lineStrong: "#736d60" },
  },
  /* Plate — the landing sheet's ground, carried indoors. Its day/night span is
     deliberately narrow: the poster's identity is the constant, so the
     circadian engine breathes it rather than re-inking it. */
  plate: {
    /* ink3 is lifted off the landing sheet's --ink-faint (#6E7681): that value
       is AA-large only, and in here it carries small text. Measured ≥4.5:1 on
       every plate surface including the lightest (day `surface`). */
    day: { table: "#0f1215", paper: "#15181b", paperCool: "#181c20", paperWarm: "#1a1e22", surface: "#1e2328", ink: "#f2f4f7", ink2: "#a7aeb8", ink3: "#868e98", line: "#262b31", lineStrong: "#434b54", shadow: "rgba(0,0,0,.55)" },
    night: { table: "#0a0c0e", paper: "#0f1113", paperCool: "#121416", paperWarm: "#141719", surface: "#181c1f", ink: "#f0f2f5", ink2: "#9ba3af", ink3: "#828a94", line: "#23272c", lineStrong: "#3c434b", shadow: "rgba(0,0,0,.7)" },
    minerals: PLATE_MIN, accents: { intent: "#c9a03a", verify: "#58d68d", human: "#e74c3c", explain: "#6bb6e8" }, humanFill: "#c0473a", humanInk: "#fbf3ee",
    hc: { ink: "#ffffff", ink2: "#d5dbe1", line: "#4a545f", lineStrong: "#6b7681" },
  },
  blueprint: {
    day: { table: "#1b1f24", paper: "#20252b", paperCool: "#252b32", paperWarm: "#2a313a", surface: "#2f3741", ink: "#eef2f6", ink2: "#a7b1bd", ink3: "#727d8a", line: "#323a44", lineStrong: "#44505d", shadow: "rgba(0,0,0,.55)" },
    night: { table: "#101316", paper: "#15181c", paperCool: "#191d22", paperWarm: "#1d222a", surface: "#222932", ink: "#eef2f6", ink2: "#a2acb8", ink3: "#6d7884", line: "#262d35", lineStrong: "#3a4450", shadow: "rgba(0,0,0,.68)" },
    minerals: VIVID, accents: { intent: "#ecc24f", verify: "#5fcf8a", human: "#ef8a73", explain: "#6bb6e8" }, humanFill: "#c0473a", humanInk: "#fbf3ee",
    hc: { ink: "#ffffff", ink2: "#cdd6df", line: "#4a545f", lineStrong: "#64707d" },
  },
};

const hx = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const toHex = (a) => "#" + a.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, f) => { const x = hx(a), y = hx(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * f)); };
const root = document.documentElement;

export function applyTokens(theme, tone, contrast) {
  const t = THEMES[theme], f = tone / 100, o = {};
  K.forEach((k) => (o[k] = mix(t.day[k], t.night[k], f)));
  o.shadow = f < 0.5 ? t.day.shadow : t.night.shadow;
  if (contrast === "high") { o.ink = t.hc.ink; o.ink2 = t.hc.ink2; o.line = t.hc.line; o.lineStrong = t.hc.lineStrong; }
  const S = root.style;
  S.setProperty("--table", o.table); S.setProperty("--paper", o.paper); S.setProperty("--paper-cool", o.paperCool);
  S.setProperty("--paper-warm", o.paperWarm); S.setProperty("--surface", o.surface);
  S.setProperty("--ink", o.ink); S.setProperty("--ink-2", o.ink2); S.setProperty("--ink-3", o.ink3);
  S.setProperty("--line", o.line); S.setProperty("--line-strong", o.lineStrong); S.setProperty("--shadow", o.shadow);
  S.setProperty("--accent-intent", t.accents.intent); S.setProperty("--accent-verify", t.accents.verify);
  S.setProperty("--accent-human", t.accents.human); S.setProperty("--accent-explain", t.accents.explain);
  S.setProperty("--human-fill", t.humanFill); S.setProperty("--human-fill-ink", t.humanInk);
  S.setProperty("--s-working", t.minerals.working); S.setProperty("--s-session", t.minerals.session);
  S.setProperty("--s-episodic", t.minerals.episodic); S.setProperty("--s-semantic", t.minerals.semantic);
  S.setProperty("--s-preference", t.minerals.preference); S.setProperty("--s-archive", t.minerals.archive);
  root.dataset.theme = theme; root.dataset.contrast = contrast;
}

export function circadianTone(d) { const h = d.getHours() + d.getMinutes() / 60; return Math.round(50 - 50 * Math.cos(((h - 13) / 24) * 2 * Math.PI)); }
export function toneWord(v) { return v < 20 ? "bright morning" : v < 40 ? "midday" : v < 60 ? "afternoon" : v < 80 ? "golden hour" : "deep evening"; }

const KEY = "stratum.a11y";

export function initTheme() {
  const form = document.getElementById("settings-form");
  const dlg = document.getElementById("settings-dialog");
  const toneEl = document.getElementById("tone");
  const toneVal = document.getElementById("tone-val");
  const autoEl = document.getElementById("tone-auto");

  const darkMQ = matchMedia("(prefers-color-scheme: dark)");
  /* Plate is the dark default so arriving from the landing sheet at / lands
     the visitor in the same room they were just looking at. */
  const groundFor = (dark) => (dark ? "plate" : "vellum");

  const defaults = {
    theme: groundFor(darkMQ.matches),
    /* Distinguishes "we picked this for you" from "you picked this". render()
       persists on first paint, so without this flag a default would look like
       a deliberate choice and system changes could never be followed. */
    themeExplicit: false,
    tone: 20,
    toneAuto: true,
    contrast: matchMedia("(prefers-contrast: more)").matches ? "high" : "standard",
    motion: matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full",
    text: "1",
  };

  let s = Object.assign({}, defaults);
  try { s = Object.assign(s, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* fresh */ }

  let timer = null;
  function render() {
    const tone = s.toneAuto ? circadianTone(new Date()) : Number(s.tone);
    applyTokens(s.theme, tone, s.contrast);
    root.dataset.motion = s.motion;
    root.style.setProperty("--text-scale", s.text);
    form.querySelectorAll("input[type=radio]").forEach((i) => { i.checked = String(s[i.name]) === i.value; });
    toneEl.value = tone; toneEl.disabled = s.toneAuto; autoEl.checked = s.toneAuto;
    toneVal.textContent = (s.toneAuto ? "auto · " : "") + toneWord(tone) + " (" + tone + ")";
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  }
  function startAuto() { stopAuto(); if (s.toneAuto) timer = setInterval(() => { if (s.toneAuto) render(); }, 3e5); }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  render(); startAuto();

  form.addEventListener("change", (e) => {
    const i = e.target;
    if (i && i.name) {
      if (i.name === "theme") s.themeExplicit = true; // a chosen ground is never overridden
      s[i.name] = i.value;
      render();
    }
  });

  /* Follow the system light/dark switch live — but only while the visitor has
     not chosen a ground themselves. An explicit choice outranks the OS. */
  darkMQ.addEventListener("change", (e) => {
    if (s.themeExplicit) return;
    s.theme = groundFor(e.matches);
    render();
  });
  toneEl.addEventListener("input", () => { s.toneAuto = false; s.tone = Number(toneEl.value); render(); });
  autoEl.addEventListener("change", () => { s.toneAuto = autoEl.checked; render(); startAuto(); });

  document.getElementById("btn-settings").addEventListener("click", () => dlg.showModal());
  document.getElementById("settings-close").addEventListener("click", () => dlg.close());
  document.getElementById("settings-done").addEventListener("click", () => dlg.close());
  document.getElementById("settings-reset").addEventListener("click", () => { s = Object.assign({}, defaults); render(); startAuto(); });
}
