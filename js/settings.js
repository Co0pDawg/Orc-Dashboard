// The Settings menu: per-viewer options that change how the board reads the data. Each lives in prefs.js.
import {state} from "./state.js";
import {saveDoneWhen, saveRounding, saveLogFull} from "./prefs.js";
import {initTheme} from "./theme-ui.js";
import {$, say, render} from "./board.js";
import {renderChooser} from "./chooser.js";
import {renderTime} from "./time/controller.js";

/** Binds the Settings menu: the theme editor, entry rounding, the log fill, the finished-session rule, and closing on an outside click. */
export function initSettings(){
  const menu = $("settings-menu");
  initTheme(say);
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
  menu.querySelectorAll('input[name="done-when"]').forEach(r => { r.checked = r.value === state.doneWhen; });
  menu.addEventListener("change", e => {
    if (e.target.name !== "done-when") return;
    state.doneWhen = e.target.value; saveDoneWhen(state.doneWhen);
    say(state.doneWhen === "pr" ? "Sessions now finish when their pull request is completed." : "Sessions now finish when the orchestrator marks them Done.");
    renderChooser(); render();
  });
  document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
