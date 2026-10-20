// The Settings menu: per-viewer options that change how the board reads the data. Each lives in prefs.js.
import {state} from "./state.js";
import {saveDoneWhen} from "./prefs.js";
import {$, say, render} from "./board.js";
import {renderChooser} from "./chooser.js";

/** Binds the Settings menu: the finished-session rule and closing the menu on an outside click. */
export function initSettings(){
  const menu = $("settings-menu");
  menu.querySelectorAll('input[name="done-when"]').forEach(r => { r.checked = r.value === state.doneWhen; });
  menu.addEventListener("change", e => {
    if (e.target.name !== "done-when") return;
    state.doneWhen = e.target.value; saveDoneWhen(state.doneWhen);
    say(state.doneWhen === "pr" ? "Sessions now finish when their pull request is completed." : "Sessions now finish when Fable marks them Done.");
    renderChooser(); render();
  });
  document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
