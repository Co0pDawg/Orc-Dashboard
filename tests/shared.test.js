import {test} from "node:test";
import assert from "node:assert/strict";
import {hideDoneText, editBar} from "../js/render/shared.js";
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
