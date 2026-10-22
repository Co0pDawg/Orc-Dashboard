// The theme editor in Settings > General: pick a base, tweak each token live, save custom themes. Pure parts are js/theme.js.
import {state} from "./state.js";
import {saveThemes, saveThemeId} from "./prefs.js";
import {esc} from "./util.js";
import {BUILTINS, ALL_TOKENS, TOKENS, resolveTheme, cssToHex, hexToRgb, rgbToHex, rowsHtml, warnings, parseColor} from "./theme.js";

const root = document.documentElement, $ = id => document.getElementById(id);
let draft = null, nameMode = "";
const skin = () => state.skin === "leet" ? "leet" : "sleek";
const isCustom = id => state.themes.some(t => t.id === id);

// A palette keys css/palettes.css through :root[data-palette]; a custom theme's colors sit on top as inline properties.
function apply(palette, colors){
  if (palette) root.dataset.palette = palette; else delete root.dataset.palette;
  for (const t of ALL_TOKENS) root.style.removeProperty(t);
  for (const [t, v] of Object.entries(colors)) root.style.setProperty(t, v);
}
/** Applies the selected theme (state.theme); an id that no longer exists falls back to the board's own colors. */
export function applyTheme(){
  if (!BUILTINS.some(b => b.id === state.theme) && !isCustom(state.theme)) state.theme = "";
  const r = resolveTheme(state.themes, state.theme); apply(r.palette, r.colors);
}
// Values are read back from the page, so tokens.css and palettes.css stay the only place a default color is written.
// A probe resolves var() and color-mix() (the ticket colors) to a plain color.
function values(){
  const probe = document.createElement("span"); probe.hidden = true; document.body.append(probe);
  const out = {};
  for (const [, rows] of TOKENS[skin()]) for (const [t] of rows){ probe.style.color = `var(${t})`; out[t] = cssToHex(getComputedStyle(probe).color) || "#000000"; }
  probe.remove(); return out;
}
const ed = () => $("theme-ed");
function fillBase(){
  const opt = t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`;
  $("theme-base").innerHTML = `<optgroup label="Built-in">${BUILTINS.map(opt).join("")}</optgroup>` + (state.themes.length ? `<optgroup label="Custom">${state.themes.map(opt).join("")}</optgroup>` : "");
  $("theme-base").value = draft ? draft.id : state.theme;
}
function rows(){ ed().querySelector("[data-theme-rows]").innerHTML = rowsHtml(skin(), values()); sync(); }
// Updates every row in place (a token edit can move others, e.g. Ticket 1 follows Accent), never the field being typed in.
function sync(){
  const v = values(), w = warnings(skin(), v);
  ed().querySelectorAll(".th-row").forEach(r => {
    const t = r.dataset.tok, hex = v[t], rgb = hexToRgb(hex);
    r.querySelector(".th-sw").style.background = hex;
    const c = r.querySelector('input[type="color"]'); if (c !== document.activeElement) c.value = hex;
    r.querySelectorAll("[data-ch]").forEach(n => { if (n !== document.activeElement) n.value = rgb[n.dataset.ch]; });
    const hx = r.querySelector("[data-hex]"); if (hx && hx !== document.activeElement){ hx.value = hex; hx.removeAttribute("aria-invalid"); }
    r.querySelector("[data-warn]").textContent = w[t] ? "Low contrast: " + w[t] : "";
  });
  const custom = isCustom(draft.id);
  ed().querySelectorAll('[data-th="rename"],[data-th="delete"]').forEach(b => { b.hidden = !custom; });
}
function preview(){ apply(resolveTheme(state.themes, draft.id).palette, draft.colors); }
function pick(id){ draft = {id, colors: {...resolveTheme(state.themes, id).colors}}; preview(); }
function select(id){ state.theme = id; saveThemeId(id); applyTheme(); }
// Every edit saves at once: a custom theme takes the new colors; a built-in is copied first to "<name> (custom)",
// so built-ins never change. "Reset to base" undoes the edits.
function persist(){
  if (!isCustom(draft.id)){
    const cur = BUILTINS.find(b => b.id === draft.id), nid = "c" + Date.now().toString(36);
    state.themes = [...state.themes, {id: nid, name: `${cur?.name || "Board default"} (custom)`, base: draft.id, colors: {}}];
    draft.id = nid; fillBase();
  }
  state.themes = state.themes.map(t => t.id === draft.id ? {...t, colors: {...draft.colors}} : t);
  saveThemes(state.themes); select(draft.id);
}
function open(){ pick(state.theme); fillBase(); ed().hidden = false; $("settings-menu").querySelector("[data-theme-edit]").setAttribute("aria-expanded", "true"); rows(); }
function close(){
  if (ed().hidden) return;
  ed().hidden = true; draft = null; ask(""); fillBase();
  $("settings-menu").querySelector("[data-theme-edit]").setAttribute("aria-expanded", "false");
}
// The inline name field (Save as new, Rename) and the delete confirmation; only one shows at a time.
function ask(mode){
  nameMode = mode;
  ed().querySelector("[data-th-name]").hidden = mode !== "new" && mode !== "rename";
  ed().querySelector("[data-th-del]").hidden = mode !== "delete";
  if (mode === "new" || mode === "rename"){
    const cur = [...BUILTINS, ...state.themes].find(t => t.id === draft.id);
    $("theme-name").value = mode === "rename" ? cur.name : `${cur?.name || "Board default"} copy`;
    $("theme-name").focus(); $("theme-name").select();
  }
}
function act(a, say){
  const id = draft.id;
  if (a === "reset"){ draft.colors = isCustom(id) ? {...resolveTheme(state.themes, state.themes.find(t => t.id === id).base || "").colors} : {}; if (isCustom(id)) persist(); else preview(); rows(); say("Back to the base colors."); return; }
  if (a === "new" || a === "rename" || a === "delete"){ ask(a); return; }
  if (a === "name-no" || a === "del-no"){ ask(""); return; }
  if (a === "name-ok"){
    const name = $("theme-name").value.trim(); if (!name) return;
    if (nameMode === "rename") state.themes = state.themes.map(t => t.id === id ? {...t, name} : t);
    else {
      const nid = "c" + Date.now().toString(36);
      state.themes = [...state.themes, {id: nid, name, base: resolveTheme(state.themes, id).palette, colors: {...draft.colors}}];
      draft.id = nid;
    }
    saveThemes(state.themes); select(draft.id); ask(""); fillBase(); sync();
    say(nameMode === "rename" ? `Renamed to ${name}.` : `Saved ${name}.`); return;
  }
  if (a === "del-ok"){
    const base = state.themes.find(t => t.id === id)?.base || "";
    state.themes = state.themes.filter(t => t.id !== id); saveThemes(state.themes);
    if (state.theme === id) select(isCustom(base) || BUILTINS.some(b => b.id === base) ? base : "");
    ask(""); pick(state.theme); fillBase(); rows(); say("Theme deleted.");
  }
}

/** Binds the theme editor; applies the saved theme first, so it is in place before first paint. */
export function initTheme(say){
  applyTheme(); fillBase();
  const menu = $("settings-menu");
  menu.querySelector("[data-theme-edit]").addEventListener("click", () => { if (ed().hidden) open(); else close(); });
  // Edits are already saved, so closing the menu just folds the editor away.
  menu.addEventListener("toggle", () => { if (!menu.open) close(); });
  // Collapsed, the select is the theme picker (applies and saves); expanded, it picks the base the edits start from.
  $("theme-base").addEventListener("change", e => { if (ed().hidden){ select(e.target.value); say(`Colors: ${e.target.selectedOptions[0]?.text || "Board default"}.`); } else { pick(e.target.value); select(e.target.value); rows(); } });
  ed().addEventListener("click", e => { const b = e.target.closest("[data-th]"); if (b) act(b.dataset.th, say); });
  $("theme-name").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); act("name-ok", say); } else if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); ask(""); } });
  // Copy: focusing the value field selects it. Paste: a whole color pasted into an R, G or B field fills all three.
  ed().addEventListener("focusin", e => { if (e.target.matches("[data-hex]")) e.target.select(); });
  ed().addEventListener("paste", e => {
    const n = e.target.closest("[data-ch]"); if (!n) return;
    const hex = parseColor(e.clipboardData?.getData("text") || ""); if (!hex || !/[,\s#(]|^[0-9a-f]{6}$/i.test(e.clipboardData.getData("text").trim())) return;
    e.preventDefault(); draft.colors[n.closest(".th-row").dataset.tok] = hex; persist(); sync();
  });
  ed().addEventListener("input", e => {
    const row = e.target.closest(".th-row"); if (!row) return;
    let hex;
    if (e.target.type === "color") hex = e.target.value;
    else if (e.target.matches("[data-hex]")){ hex = parseColor(e.target.value); e.target.toggleAttribute("aria-invalid", !hex); if (!hex) return; }
    else { const rgb = [...row.querySelectorAll("[data-ch]")].map(n => n.value); hex = rgbToHex(rgb); }
    draft.colors[row.dataset.tok] = hex; persist(); sync();
  });
  // A skin switch from inside the menu swaps the token list.
  $("skin-toggle").addEventListener("change", () => { if (!ed().hidden) rows(); });
}
