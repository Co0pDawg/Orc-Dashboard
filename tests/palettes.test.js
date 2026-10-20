import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {contrast, lift, mix} from "../dev/palette-math.js";
import {PALETTES} from "../js/palettes.js";

test("contrast: WCAG ratios for known pairs", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
});

test("lift: leaves a readable colour alone, moves an unreadable one just past 4.5:1 toward the target", () => {
  assert.equal(lift("#1b1f2a", "#000000", ["#ffffff"]), "#1b1f2a");
  const up = lift("#6272a4", "#ffffff", ["#44475a"]);
  assert.ok(contrast(up, "#44475a") >= 4.5);
  assert.ok(contrast(mix("#6272a4", "#ffffff", 0), "#44475a") < 4.5);
});

test("palettes.css: every scheme in js/palettes.js has light, dark and 1337 tokens, and every text token reads at 4.5:1", () => {
  const css = readFileSync(new URL("../css/palettes.css", import.meta.url), "utf8");
  for (const {id} of PALETTES){
    const blocks = [...css.matchAll(new RegExp(`:root\\[data-palette="${id}"\\][^{]*\\{([^}]*)\\}`, "g"))].map(m => Object.fromEntries(m[1].split(";").filter(Boolean).map(d => d.split(":"))));
    assert.equal(blocks.length, 3, id);
    for (const t of blocks){
      if (t["--ink"]) for (const k of ["--ink", "--muted", "--accent", "--ok-text", "--run-text", "--bad-text"])
        for (const bg of ["--bg", "--surface"]) assert.ok(contrast(t[k], t[bg]) >= 4.5, `${id} ${k} on ${bg}`);
      if (t["--t-ink"]) for (const k of ["--t-ink", "--t-dim", "--t-green", "--t-amber", "--t-red"])
        for (const bg of ["--t-bg", "--t-pane"]) assert.ok(contrast(t[k], t[bg]) >= 4.5, `${id} ${k} on ${bg}`);
    }
  }
});
