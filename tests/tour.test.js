import {test} from "node:test";
import assert from "node:assert/strict";
import {STEPS, stepsToShow, placePop} from "../js/tour.js";

test("every tour step has a target, a title and one or two short sentences", () => {
  assert.equal(STEPS.length, 9);
  for (const s of STEPS){
    assert.ok(s.sel && s.title, s.title);
    const sentences = s.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(sentences.length >= 1 && sentences.length <= 2, s.title);
    for (const x of sentences) assert.ok(x.split(/\s+/).length < 25, x);
  }
});

test("a step whose target is missing is skipped, order kept", () => {
  const present = STEPS.map(s => s.sel).filter(sel => sel !== "[data-search]");
  const out = stepsToShow(STEPS, present);
  assert.equal(out.length, 8);
  assert.ok(!out.some(s => s.sel === "[data-search]"));
  assert.deepEqual(out.map(s => s.title), STEPS.filter(s => s.sel !== "[data-search]").map(s => s.title));
  assert.deepEqual(stepsToShow(STEPS, []), []);
});

test("the popover sits below its target, else above, and never leaves the viewport", () => {
  const r = (left, top, w = 40, h = 20) => ({left, top, right: left + w, bottom: top + h});
  assert.deepEqual(placePop(r(100, 50), 300, 120, 1400, 900), {left: 100, top: 80});
  assert.deepEqual(placePop(r(100, 850), 300, 120, 1400, 900), {left: 100, top: 720});
  assert.deepEqual(placePop(r(450, 50), 300, 120, 480, 900), {left: 172, top: 80});
  const tall = placePop(r(10, 300, 40, 300), 300, 400, 480, 700);
  assert.ok(tall.top >= 8 && tall.top + 400 <= 692);
});
