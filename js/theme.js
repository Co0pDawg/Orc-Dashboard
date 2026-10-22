// Themes: a built-in palette (js/palettes.js) or a viewer's custom theme {id, name, base, colors:{token: "#rrggbb"}}.
// Pure: no DOM, no storage, so node --test loads it. The editor controller is js/theme-ui.js.
import {PALETTES} from "./palettes.js";
import {esc} from "./util.js";

/** Built-in themes: the board's own colors ("") and every generated palette. */
export const BUILTINS = [{id: "", name: "Board default"}, ...PALETTES];

// Token names and labels only; their values always come from tokens.css / palettes.css (read back from the page).
/** The editable tokens per skin, grouped, with plain labels. */
export const TOKENS = {
  sleek: [
    ["Page", [["--bg", "Background"], ["--surface", "Surface"], ["--ink", "Text"], ["--muted", "Muted text"], ["--line", "Lines"], ["--accent", "Accent"]]],
    ["Tickets", [1, 2, 3, 4, 5, 6].map(n => [`--tk-${n}`, `Ticket ${n}`])],
    ["Status", [["--ok", "Done"], ["--run", "Running"], ["--bad", "Failed"]]]
  ],
  leet: [
    ["Page", [["--t-bg", "Background"], ["--t-pane", "Pane"], ["--t-ink", "Text"], ["--t-dim", "Dim"], ["--t-faint", "Faint"]]],
    ["Colors", [["--t-green", "Green"], ["--t-lime", "Lime"], ["--t-amber", "Amber"], ["--t-red", "Red"]]],
    ["Bar", [["--t-bar", "Bar border"], ["--t-edge", "Edge"]]]
  ]
};
/** Every editable token name, both skins. */
export const ALL_TOKENS = Object.values(TOKENS).flatMap(g => g.flatMap(([, rows]) => rows.map(([t]) => t)));
// Text-on-background pairs that get a contrast warning: [foreground, background, background label].
/** The contrast-checked pairs per skin. */
export const PAIRS = {
  sleek: [["--ink", "--bg", "Background"], ["--muted", "--bg", "Background"], ["--ink", "--surface", "Surface"]],
  leet: [["--t-ink", "--t-bg", "Background"]]
};

const HEX = /^#[0-9a-f]{6}$/i;
/** "#rrggbb" to [r, g, b]. */
export const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** [r, g, b] (clamped to 0-255) to "#rrggbb". */
export const rgbToHex = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, "0")).join("");
/** A computed CSS color ("rgb(...)", "rgba(...)", "color(srgb r g b)" or "#rrggbb") as "#rrggbb", or null. */
/** A pasted color in any common form ("#282828", "282828", "#abc", "rgb(40, 40, 40)", "40, 40, 40", "40 40 40") as "#rrggbb", or null. */
export function parseColor(s){
  const t = String(s ?? "").trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(t); if (m) return "#" + m[1];
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t); if (m) return "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
  m = /^(?:rgba?\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)?$/.exec(t);
  if (m && m.slice(1, 4).every(v => Number(v) <= 255)) return rgbToHex(m.slice(1, 4));
  return null;
}
export function cssToHex(s){
  s = String(s || "").trim();
  if (HEX.test(s)) return s.toLowerCase();
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return rgbToHex(m.slice(1, 4));
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(s);
  return m ? rgbToHex(m.slice(1, 4).map(v => v * 255)) : null;
}
const lum = h => { const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio of two "#rrggbb" colors (1 to 21). */
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Stored themes cleaned: only well-formed ones, colors limited to known tokens with hex values. */
export const cleanThemes = list => (Array.isArray(list) ? list : []).filter(t => t && typeof t.id === "string" && t.id && typeof t.name === "string")
  .map(t => ({id: t.id, name: t.name, base: typeof t.base === "string" ? t.base : "", colors: Object.fromEntries(Object.entries(t.colors || {}).filter(([k, v]) => ALL_TOKENS.includes(k) && HEX.test(v)))}));

// A custom theme's base can be another custom theme; the chain ends at a built-in, and a loop or a missing id ends at the default.
/** {palette, colors} for a theme id: the built-in palette underneath and the merged overrides (base first, own last). */
export function resolveTheme(themes, id, depth = 0){
  if (BUILTINS.some(b => b.id === id)) return {palette: id, colors: {}};
  const t = themes.find(x => x.id === id);
  if (!t || depth > 8) return {palette: "", colors: {}};
  const b = resolveTheme(themes, t.base, depth + 1);
  return {palette: b.palette, colors: {...b.colors, ...t.colors}};
}

/** Migrates the old board.palette / board.barColor prefs once: a saved bar color becomes custom theme "My theme". */
export function migrateTheme({theme, themes, palette, barColor}){
  if (theme != null) return {theme, themes, migrated: false};
  const base = PALETTES.some(p => p.id === palette) ? palette : "";
  if (!HEX.test(barColor || "")) return {theme: base, themes, migrated: true};
  return {theme: "my-theme", themes: [...themes.filter(t => t.id !== "my-theme"), {id: "my-theme", name: "My theme", base, colors: {"--t-bar": barColor.toLowerCase()}}], migrated: true};
}

/** The editor's token rows for a skin, given each token's current "#rrggbb". */
export const rowsHtml = (skin, values) => TOKENS[skin].map(([group, rows]) => `<fieldset class="th-group"><legend>${group}</legend>${rows.map(([t, label]) => {
  const v = esc(values[t] || "#000000"), [r, g, b] = hexToRgb(values[t] || "#000000"), id = "th" + t.replace(/-/g, "_");
  return `<div class="th-row" data-tok="${t}"><span class="th-sw" style="background:${v}"></span><label for="${id}">${label}</label><input type="color" id="${id}" value="${v}"><input type="text" class="th-hex" data-hex aria-label="${label} value (paste hex or rgb)" title="Click to select and copy; paste #hex, rgb(), or R, G, B" value="${v}" spellcheck="false" autocomplete="off" maxlength="40"><span class="th-rgb">${["R", "G", "B"].map((c, i) => `<input type="number" min="0" max="255" data-ch="${i}" aria-label="${label} ${c}" value="${[r, g, b][i]}">`).join("")}</span><span class="th-warn" data-warn></span></div>`;
}).join("")}</fieldset>`).join("");
/** The contrast warning per foreground token: {token: "2.1:1 on Background"} for each pair under 4.5:1. */
export function warnings(skin, values){
  const out = {};
  for (const [fg, bg, label] of PAIRS[skin]){
    if (!values[fg] || !values[bg]) continue;
    const r = contrast(values[fg], values[bg]);
    if (r < 4.5) out[fg] = (out[fg] ? out[fg] + ", " : "") + `${r.toFixed(1)}:1 on ${label}`;
  }
  return out;
}
