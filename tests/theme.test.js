import {test} from "node:test";
import assert from "node:assert/strict";
import {hexToRgb, rgbToHex, cssToHex, contrast, resolveTheme, migrateTheme, cleanThemes, warnings, rowsHtml, TOKENS} from "../js/theme.js";

test("hex <-> rgb round-trips and clamps", () => {
  assert.deepEqual(hexToRgb("#4fc3f7"), [79, 195, 247]);
  assert.equal(rgbToHex([79, 195, 247]), "#4fc3f7");
  assert.equal(rgbToHex([300, -4, "12"]), "#ff000c");
  assert.equal(cssToHex("rgb(79, 195, 247)"), "#4fc3f7");
  assert.equal(cssToHex("color(srgb 1 0 0.5)"), "#ff0080");
  assert.equal(cssToHex("var(--x)"), null);
});

test("contrast: WCAG ratios and the 4.5:1 warning", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
  assert.deepEqual(warnings("sleek", {"--ink": "#000000", "--muted": "#777777", "--bg": "#ffffff", "--surface": "#ffffff"}), {"--muted": "4.5:1 on Background"});
  assert.deepEqual(warnings("leet", {"--t-ink": "#dfe4dc", "--t-bg": "#070908"}), {});
});

test("theme merge: base first, overrides last; built-ins and missing ids resolve safely", () => {
  const themes = [{id: "a", name: "A", base: "nord", colors: {"--bg": "#111111", "--ink": "#eeeeee"}}, {id: "b", name: "B", base: "a", colors: {"--bg": "#222222"}}, {id: "loop", name: "L", base: "loop", colors: {}}];
  assert.deepEqual(resolveTheme(themes, "b"), {palette: "nord", colors: {"--bg": "#222222", "--ink": "#eeeeee"}});
  assert.deepEqual(resolveTheme(themes, "dracula"), {palette: "dracula", colors: {}});
  assert.deepEqual(resolveTheme(themes, "gone"), {palette: "", colors: {}});
  assert.deepEqual(resolveTheme(themes, "loop"), {palette: "", colors: {}});
});

test("migration: a saved bar color becomes My theme on the saved palette; otherwise the palette is selected", () => {
  assert.deepEqual(migrateTheme({theme: null, themes: [], palette: "nord", barColor: "#4FC3F7"}),
    {theme: "my-theme", themes: [{id: "my-theme", name: "My theme", base: "nord", colors: {"--t-bar": "#4fc3f7"}}], migrated: true});
  assert.deepEqual(migrateTheme({theme: null, themes: [], palette: "gruvbox", barColor: null}), {theme: "gruvbox", themes: [], migrated: true});
  assert.deepEqual(migrateTheme({theme: null, themes: [], palette: "bogus", barColor: "nope"}), {theme: "", themes: [], migrated: true});
  assert.equal(migrateTheme({theme: "x", themes: [], palette: "nord", barColor: "#4fc3f7"}).migrated, false);
});

test("cleanThemes drops malformed themes, unknown tokens and non-hex values", () => {
  assert.deepEqual(cleanThemes([{id: "a", name: "A", colors: {"--bg": "#010203", "--nope": "#010203", "--ink": "red"}}, {name: "no id"}, null]),
    [{id: "a", name: "A", base: "", colors: {"--bg": "#010203"}}]);
  assert.deepEqual(cleanThemes("junk"), []);
});

test("editor rows: one per token of the skin, values escaped", () => {
  const html = rowsHtml("leet", {"--t-bg": "#000000"});
  assert.equal((html.match(/class="th-row"/g) || []).length, TOKENS.leet.flatMap(g => g[1]).length);
  assert.ok(html.includes('data-tok="--t-bar"'));
  assert.ok(!rowsHtml("sleek", {"--bg": '"><x'}).includes('"><x'));
});

test("contrast warnings: each checked pair on its own, and one token failing two pairs lists both", () => {
  const ok = {"--ink": "#000000", "--muted": "#000000", "--bg": "#ffffff", "--surface": "#eeeeee"};
  assert.deepEqual(warnings("sleek", ok), {});
  // Text on background alone (surface dark so text passes there).
  assert.deepEqual(Object.keys(warnings("sleek", {...ok, "--ink": "#bbbbbb", "--surface": "#000000"})), ["--ink"]);
  assert.match(warnings("sleek", {...ok, "--ink": "#bbbbbb", "--surface": "#000000"})["--ink"], /^[\d.]+:1 on Background$/);
  // Muted on background alone.
  assert.match(warnings("sleek", {...ok, "--muted": "#cccccc"})["--muted"], /on Background$/);
  // Text on surface alone (bg stays light, surface turns dark).
  assert.match(warnings("sleek", {...ok, "--ink": "#000000", "--surface": "#111111"})["--ink"], /^[\d.]+:1 on Surface$/);
  // One token failing both its pairs reports both, joined.
  assert.match(warnings("sleek", {...ok, "--ink": "#f0f0f0", "--surface": "#ffffff"})["--ink"], /on Background, .* on Surface$/);
  // 1337 ink on background.
  assert.match(warnings("leet", {"--t-ink": "#101010", "--t-bg": "#000000"})["--t-ink"], /on Background$/);
});
