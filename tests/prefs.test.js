import {test} from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k)};
const {loadToured, saveToured} = await import("../js/prefs.js");

test("board.toured starts unset and saveToured sets it", () => {
  assert.equal(loadToured(), false);
  saveToured();
  assert.equal(mem.get("board.toured"), "1");
  assert.equal(loadToured(), true);
});

test("a throwing storage reads as not toured and never throws", () => {
  const keep = globalThis.localStorage;
  globalThis.localStorage = {getItem(){ throw new Error("blocked"); }, setItem(){ throw new Error("blocked"); }};
  assert.equal(loadToured(), false);
  assert.doesNotThrow(saveToured);
  globalThis.localStorage = keep;
});
