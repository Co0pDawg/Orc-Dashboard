import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hideDoneText, editBar, editChrome, editBtn} from "../js/render/shared.js";
import {state} from "../js/state.js";

test("the Hide done label is fixed, whatever the state; aria-pressed carries it", () => {
  assert.equal(hideDoneText(3, false), "Hide done (3)");
  assert.equal(hideDoneText(1, true), "[hide done:1]");
});

test("a log that fills its column gets no height controls in its edit bar", () => {
  state.cols = 3;
  const full = editBar("log:s1"), fixed = editBar("log:s1", true);
  assert.match(full, /data-act="h\+"/);
  assert.match(full, /1 row</);
  assert.doesNotMatch(fixed, /data-act="h[+-]"|\d rows?</);
  assert.match(fixed, /data-act="w\+"/);
  assert.match(fixed, /data-act="reset"/);
});

test("only a pane whose pencil is on gets the edit bar and corner, and the bar names that pane", () => {
  state.cols = 3; state.editing = new Set(["c2"]);
  const on = editChrome("c2"), off = editChrome("c1");
  assert.match(on.bar, /role="toolbar" aria-label="Layout for c2"/);
  assert.match(on.bar, /Move c2 earlier/);
  assert.match(on.corner, /class="corner"/);
  assert.deepEqual(off, {bar: "", corner: ""});
  assert.equal(editChrome("c2", true).corner, "", "a log that fills its column has no corner");
  state.editing = new Set();
});

test("the pane pencil toggles per pane in both skins, with a 1337 bracket face", () => {
  state.editing = new Set(["c2"]);
  const sleekOn = editBtn("c2", "#18001 A <b>", false), sleekOff = editBtn("c1", "#18000 B", false), leet = editBtn("c2", "#18001 A", true);
  assert.match(sleekOn, /data-edit="c2" aria-pressed="true" aria-label="Edit layout of #18001 A &lt;b&gt;" title="Edit layout">✎<\/button>/);
  assert.match(sleekOff, /aria-pressed="false" aria-label="Edit layout of #18000 B"/);
  assert.match(leet, />\[✎\]<\/button>/);
  state.editing = new Set();
});

test("Settings holds the Layout reset row, and the global Customize layout button is gone", () => {
  const html = readFileSync(new URL("../orchestration-board.html", import.meta.url), "utf8");
  // The menu lives in its partial; the page keeps only the empty <details id="settings-menu"> shell.
  const gear = readFileSync(new URL("../js/partials/settings-menu.js", import.meta.url), "utf8");
  assert.match(html, /<details class="pop settings" id="settings-menu">/);
  assert.match(gear, /<span class="opt-h" id="layout-h">Layout<\/span>/);
  for (const r of ["order", "size", "all"]) assert.match(gear, new RegExp(`data-reset="${r}"`));
  assert.doesNotMatch(html, /id="(customize|reset-menu|layout-bar|controls)"/);
});

test("every pane body carries its pencil in both skins", async () => {
  const {sleekCard, sleekLog} = await import("../js/render/sleek.js"), {leetCard, leetLog} = await import("../js/render/leet.js");
  const c = {_id: "c9", task: "1", title: "T", kind: "Task", stages: []};
  assert.match(sleekCard(c, "", false), /data-edit="c9"/);
  assert.match(leetCard(c, "", false), /data-edit="c9"/);
  assert.match(sleekLog([], true, "s1", []), /data-edit="log:s1"/);
  assert.match(leetLog([], "", true, "s1", []), /data-edit="log:s1"/);
});
