// The Settings menu: per-viewer options that change how the board reads the data. Each lives in prefs.js.
import {state} from "./state.js";
import {saveDoneWhen, saveBarColor} from "./prefs.js";
import {$, say, render} from "./board.js";
import {renderChooser} from "./chooser.js";

// 1337 status bar border color; it also outlines and tints the active tab.
function setBar(c){
  state.barColor = c;
  document.documentElement.style.setProperty("--t-bar", c);
}

/** Binds the Settings menu: the 1337 border color, the finished-session rule, and closing on an outside click. */
export function initSettings(){
  const menu = $("settings-menu"), color = $("bar-color");
  color.value = state.barColor; setBar(state.barColor);
  color.addEventListener("input", () => setBar(color.value));
  color.addEventListener("change", () => saveBarColor(state.barColor));
  menu.querySelectorAll('input[name="done-when"]').forEach(r => { r.checked = r.value === state.doneWhen; });
  menu.addEventListener("change", e => {
    if (e.target.name !== "done-when") return;
    state.doneWhen = e.target.value; saveDoneWhen(state.doneWhen);
    say(state.doneWhen === "pr" ? "Sessions now finish when their pull request is completed." : "Sessions now finish when Fable marks them Done.");
    renderChooser(); render();
  });
  document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
