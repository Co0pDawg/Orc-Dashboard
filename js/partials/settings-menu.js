// The Settings gear's menu, kept out of the page shell. main.js imports this first, so the menu's controls exist
// before any other module looks them up (board.js reads #skin-toggle at load). Static markup only: no db values.
// General shows on every page; a [data-page] section shows only on its page (css/base.css, keyed on body[data-view]).
export const settingsMenuHtml = `
  <summary class="btn gear" title="Settings" aria-label="Settings">⚙</summary>
  <div class="menu">
    <section class="opt-sec" aria-labelledby="set-general"><h3 class="opt-sec-h" id="set-general">General</h3>
    <div class="opt">
      <span class="opt-h">Theme</span>
      <label class="skin" for="skin-toggle"><span id="lbl-sleek">Sleek</span><input type="checkbox" role="switch" id="skin-toggle" aria-label="Terminal (1337) look"><span id="lbl-leet">1337</span></label>
    </div>
    <div class="opt"><button type="button" class="btn" data-theme-edit aria-expanded="false" aria-controls="theme-ed">Customize colors</button></div>
    <div class="theme-ed" id="theme-ed" hidden>
      <label class="opt pick" for="theme-base"><span class="opt-h">Base</span><select id="theme-base"></select></label>
      <div data-theme-rows></div>
      <div class="th-acts">
        <button type="button" class="btn" data-th="save">Save</button>
        <button type="button" class="btn" data-th="new">Save as new</button>
        <button type="button" class="btn" data-th="rename">Rename</button>
        <button type="button" class="btn" data-th="delete">Delete</button>
        <button type="button" class="btn" data-th="reset">Reset to base</button>
        <button type="button" class="btn" data-th="cancel">Cancel</button>
      </div>
      <div class="th-name" data-th-name hidden><label for="theme-name">Name</label><input type="text" id="theme-name" maxlength="40" autocomplete="off"><button type="button" class="btn" data-th="name-ok">OK</button><button type="button" class="btn" data-th="name-no">Back</button></div>
      <div class="th-name" data-th-del hidden><span>Delete this theme?</span><button type="button" class="btn" data-th="del-ok">Delete</button><button type="button" class="btn" data-th="del-no">Keep</button></div>
    </div>
    </section>
    <section class="opt-sec" data-page="board" aria-labelledby="set-board"><h3 class="opt-sec-h" id="set-board">Board</h3>
    <div class="opt">
      <label for="log-full"><input type="checkbox" id="log-full" aria-describedby="log-full-help"> Activity log fills its column</label>
      <small id="log-full-help">The log stretches down every row its session's cards use, so it never needs resizing by hand.</small>
    </div>
    <div class="opt" role="group" aria-labelledby="layout-h">
      <span class="opt-h" id="layout-h">Layout</span>
      <span class="reset-btns">Reset <button type="button" class="btn" data-reset="order" aria-label="Reset order" title="Activity log first, tickets in plan order">Order</button><button type="button" class="btn" data-reset="size" aria-label="Reset sizes" title="Every pane back to one column, one row">Sizes</button><button type="button" class="btn" data-reset="all" aria-label="Reset everything" title="Order and sizes">Everything</button></span>
      <small>Each reset can be undone. To move or resize one pane, use the ✎ on its header.</small>
    </div>
    <fieldset class="opt">
      <legend>A session counts as finished when</legend>
      <label><input type="radio" name="done-when" id="done-when-orchestrator" value="orchestrator"> The orchestrator marks it Done</label>
      <label><input type="radio" name="done-when" id="done-when-pr" value="pr"> Its pull request is completed</label>
      <small>Until then it stays on the chips and expanded, with its PR status in the header. Sessions without a recorded PR finish when the orchestrator marks them Done.</small>
    </fieldset>
    <div class="opt"><button type="button" class="btn" data-tour>Take the tour</button></div>
    </section>
    <section class="opt-sec" data-page="time" aria-labelledby="set-time"><h3 class="opt-sec-h" id="set-time">Time</h3>
    <label class="opt pick" for="rounding"><span class="opt-h">Entry rounding</span><select id="rounding"><option value="1">Exact</option><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option></select></label>
    <div class="opt"><button type="button" class="btn" data-tour>Take the tour</button></div>
    </section>
  </div>
`;

const menu = typeof document !== "undefined" && document.getElementById("settings-menu");
if (menu) menu.innerHTML = settingsMenuHtml;
