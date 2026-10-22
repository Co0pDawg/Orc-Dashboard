// The Settings gear's menu, kept out of the page shell. main.js imports this first, so the menu's controls exist
// before any other module looks them up (board.js reads #skin-toggle at load). Static markup only: no db values.
export const settingsMenuHtml = `
  <summary class="btn gear" title="Settings" aria-label="Settings">⚙</summary>
  <div class="menu">
    <div class="opt">
      <span class="opt-h">Theme</span>
      <label class="skin" for="skin-toggle"><span id="lbl-sleek">Sleek</span><input type="checkbox" role="switch" id="skin-toggle" aria-label="Terminal (1337) look"><span id="lbl-leet">1337</span></label>
    </div>
    <label class="opt pick" for="palette"><span class="opt-h">Colors</span><select id="palette"><option value="">Board default</option></select></label>
    <label class="opt pick" for="rounding"><span class="opt-h">Entry rounding</span><select id="rounding"><option value="1">Exact</option><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option></select></label>
    <div class="opt">
      <label for="log-full"><input type="checkbox" id="log-full" aria-describedby="log-full-help"> Activity log fills its column</label>
      <small id="log-full-help">The log stretches down every row its session's cards use, so it never needs resizing by hand.</small>
    </div>
    <div class="opt" role="group" aria-labelledby="layout-h">
      <span class="opt-h" id="layout-h">Layout</span>
      <span class="reset-btns">Reset <button type="button" class="btn" data-reset="order" aria-label="Reset order" title="Activity log first, tickets in plan order">Order</button><button type="button" class="btn" data-reset="size" aria-label="Reset sizes" title="Every pane back to one column, one row">Sizes</button><button type="button" class="btn" data-reset="all" aria-label="Reset everything" title="Order and sizes">Everything</button></span>
      <small>Each reset can be undone. To move or resize one pane, use the ✎ on its header.</small>
    </div>
    <div class="opt bar-color">
      <label for="bar-color" class="opt-h">1337 bar border</label>
      <span class="bar-pick"><button type="button" class="btn" id="bar-auto" title="Use the color scheme's own green">Match colors</button><input type="color" id="bar-color" value="#79e36a"></span>
    </div>
    <fieldset class="opt">
      <legend>A session counts as finished when</legend>
      <label><input type="radio" name="done-when" id="done-when-orchestrator" value="orchestrator"> The orchestrator marks it Done</label>
      <label><input type="radio" name="done-when" id="done-when-pr" value="pr"> Its pull request is completed</label>
      <small>Until then it stays on the chips and expanded, with its PR status in the header. Sessions without a recorded PR finish when the orchestrator marks them Done.</small>
    </fieldset>
    <div class="opt"><button type="button" class="btn" data-tour>Take the tour</button></div>
  </div>
`;

const menu = typeof document !== "undefined" && document.getElementById("settings-menu");
if (menu) menu.innerHTML = settingsMenuHtml;
