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

test("themes: migration runs once, then save, rename, delete and select round-trip", async () => {
  const {loadThemes, saveThemes, saveThemeId} = await import("../js/prefs.js");
  mem.clear(); mem.set("board.palette", "nord"); mem.set("board.barColor", "#4fc3f7");
  let r = loadThemes();
  assert.equal(r.theme, "my-theme");
  assert.deepEqual(r.themes[0].colors, {"--t-bar": "#4fc3f7"});
  assert.ok(!mem.has("board.barColor") && !mem.has("board.palette"));
  mem.set("board.barColor", "#000000"); // a later stray value is ignored once board.theme exists
  saveThemes([...r.themes, {id: "c1", name: "Mine", base: "dracula", colors: {"--bg": "#101010"}}]); saveThemeId("c1");
  r = loadThemes(); assert.equal(r.theme, "c1"); assert.equal(r.themes.length, 2);
  saveThemes(r.themes.map(t => t.id === "c1" ? {...t, name: "Renamed"} : t));
  assert.equal(loadThemes().themes[1].name, "Renamed");
  saveThemes(loadThemes().themes.filter(t => t.id !== "c1")); saveThemeId("gruvbox");
  r = loadThemes(); assert.deepEqual(r.themes.map(t => t.id), ["my-theme"]); assert.equal(r.theme, "gruvbox");
});
