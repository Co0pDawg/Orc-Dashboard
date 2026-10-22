// The Settings menu: per-viewer options that change how the board reads the data. Each lives in prefs.js.
import {state} from "./state.js";
import {saveDoneWhen, saveBarColor, savePalette, saveRounding, saveLogFull} from "./prefs.js";
import {PALETTES} from "./palettes.js";
import {esc} from "./util.js";
import {$, say, render} from "./board.js";
import {renderChooser} from "./chooser.js";
import {renderTime} from "./time/controller.js";

// 1337 status bar border color; it also outlines and tints the active tab. null follows the color scheme's green.
function setBar(c){
  state.barColor = c;
  if (c) document.documentElement.style.setProperty("--t-bar", c); else document.documentElement.style.removeProperty("--t-bar");
  const color = $("bar-color"), auto = $("bar-auto");
  if (color) color.value = c || getComputedStyle(document.documentElement).getPropertyValue("--t-bar").trim() || "#79e36a";
  if (auto) auto.disabled = !c;
}
// A scheme overrides the tokens through css/palettes.css, keyed on :root[data-palette].
function applyPalette(){
  const ok = PALETTES.some(p => p.id === state.palette);
  if (ok) document.documentElement.dataset.palette = state.palette; else { delete document.documentElement.dataset.palette; state.palette = ""; }
  setBar(state.barColor);
}

/** Binds the Settings menu: color scheme, entry rounding, 1337 border color, the finished-session rule, and closing on an outside click. */
export function initSettings(){
  const menu = $("settings-menu"), color = $("bar-color"), pick = $("palette");
  pick.insertAdjacentHTML("beforeend", PALETTES.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(""));
  applyPalette(); pick.value = state.palette;
  pick.addEventListener("change", () => {
    state.palette = pick.value; savePalette(state.palette); applyPalette();
    say(`Colors: ${pick.options[pick.selectedIndex].text}.`);
  });
  const rounding = $("rounding");
  rounding.value = String(state.rounding);
  rounding.addEventListener("change", () => {
    state.rounding = Number(rounding.value); saveRounding(state.rounding);
    say(`Entry rounding: ${rounding.options[rounding.selectedIndex].text}.`);
    renderTime();
  });
  const logFull = $("log-full");
  logFull.checked = state.logFull;
  logFull.addEventListener("change", () => {
    state.logFull = logFull.checked; saveLogFull(logFull.checked);
    say(`The activity log ${logFull.checked ? "now fills its column" : "keeps its own height"}.`);
    render();
  });
  color.addEventListener("input", () => setBar(color.value));
  color.addEventListener("change", () => saveBarColor(state.barColor));
  $("bar-auto").addEventListener("click", () => { saveBarColor(null); setBar(null); say("The 1337 bar border follows the colors again."); });
  menu.querySelectorAll('input[name="done-when"]').forEach(r => { r.checked = r.value === state.doneWhen; });
  menu.addEventListener("change", e => {
    if (e.target.name !== "done-when") return;
    state.doneWhen = e.target.value; saveDoneWhen(state.doneWhen);
    say(state.doneWhen === "pr" ? "Sessions now finish when their pull request is completed." : "Sessions now finish when the orchestrator marks them Done.");
    renderChooser(); render();
  });
  document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
