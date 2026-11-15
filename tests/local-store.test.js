import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openStore} from "../local/store.js";
import {matches, runQuery} from "../local/query.js";

const fresh = () => openStore(mkdtempSync(join(tmpdir(), "orc-store-")));
const conflict = v => e => e.code === "conflict" && e.version === v;

test("store: set/get round-trip, versions increment, list", () => {
  const s = fresh();
  assert.equal(s.get("cards", "c1"), null);
  assert.deepEqual(s.set("cards", "c1", {title: "A", stages: [{label: "Build"}]}), {id: "c1", version: 1, data: {title: "A", stages: [{label: "Build"}]}});
  assert.equal(s.set("cards", "c1", {title: "B"}).version, 2);
  assert.deepEqual(s.get("cards", "c1"), {id: "c1", version: 2, data: {title: "B"}});
  s.set("cards", "c0", {title: "Z"});
  assert.deepEqual(s.list("cards").map(d => d.id), ["c0", "c1"]);
  assert.deepEqual(s.collections(), ["cards"]);
});

test("store: an ifVersion conflict writes nothing and carries the current version", () => {
  const s = fresh();
  s.set("cards", "c1", {a: 1});
  assert.throws(() => s.set("cards", "c1", {a: 2}, {ifVersion: 3}), conflict(1));
  assert.throws(() => s.append("cards", "c1", "p", 1, {ifVersion: 2}), conflict(1));
  assert.throws(() => s.set("cards", "new", {a: 2}, {ifVersion: 1}), conflict(0));
  assert.deepEqual(s.get("cards", "c1"), {id: "c1", version: 1, data: {a: 1}});
  assert.equal(s.set("cards", "c1", {a: 3}, {ifVersion: 1}).version, 2);
});

test("store: update merges top-level fields and removes __delete__ fields; creates when absent", () => {
  const s = fresh();
  assert.deepEqual(s.update("s", "x", {a: 1}).data, {a: 1});
  s.set("s", "x", {a: 1, b: {c: 2}, d: 4});
  assert.deepEqual(s.update("s", "x", {b: {e: 5}, d: {__delete__: true}, f: 6}).data, {a: 1, b: {e: 5}, f: 6});
});

test("store: append creates the array and the doc, then pushes", () => {
  const s = fresh();
  assert.deepEqual(s.append("cards", "c1", "progress", {at: "t1", text: "one"}), {id: "c1", version: 1, data: {progress: [{at: "t1", text: "one"}]}});
  assert.deepEqual(s.append("cards", "c1", "progress", {at: "t2", text: "two"}).data.progress.map(p => p.text), ["one", "two"]);
  s.set("cards", "c2", {progress: "x"});
  assert.throws(() => s.append("cards", "c2", "progress", 1), e => e.code === "invalid");
});

test("store: batch is all-or-nothing (a failing pin in entry 2 leaves entry 1 unwritten)", () => {
  const s = fresh();
  s.set("cards", "c2", {a: 1});
  assert.throws(() => s.batch([{op: "set", collection: "sessions", id: "s1", data: {t: 1}}, {op: "update", collection: "cards", id: "c2", data: {a: 2}, ifVersion: 5}]), conflict(1));
  assert.equal(s.get("sessions", "s1"), null);
  assert.deepEqual(s.get("cards", "c2").data, {a: 1});
  const r = s.batch([{op: "set", collection: "sessions", id: "s1", data: {t: 1}}, {op: "append", collection: "sessions", id: "s1", field: "events", value: {text: "e"}}, {op: "delete", collection: "cards", id: "c2", ifVersion: 1}]);
  assert.equal(r[1].version, 2);
  assert.deepEqual(s.get("sessions", "s1").data, {t: 1, events: [{text: "e"}]});
  assert.equal(s.get("cards", "c2"), null);
});

test("store: invalid ids and data are rejected before touching disk", () => {
  const s = fresh();
  for (const id of ["..", ".", "a/b", "a\\b", "", "x".repeat(201), "sp ace"]){
    assert.throws(() => s.set("cards", id, {}), e => e.code === "invalid", id);
    assert.throws(() => s.get(id, "c1"), e => e.code === "invalid", id);
  }
  assert.throws(() => s.set("cards", "c1", [1]), e => e.code === "invalid");
  assert.throws(() => s.set("cards", "c1", "x"), e => e.code === "invalid");
  assert.deepEqual(readdirSync(s.dir), []);
  assert.equal(s.set("cards", "x".repeat(200), {}).version, 1);
});

test("store: ids with ':' and reserved Windows names round-trip", () => {
  const s = fresh();
  for (const id of ["2026-10-19T08:05:00-04:00", "a@b+c~d", "con", "nul.txt", "end."]) {
    s.set("timeline", id, {id});
    assert.deepEqual(s.get("timeline", id).data, {id});
  }
  assert.deepEqual(s.list("timeline").map(d => d.id).sort(), ["2026-10-19T08:05:00-04:00", "a@b+c~d", "con", "end.", "nul.txt"]);
});

test("store: ids and collections that differ only in case stay separate (file names ignore case on Windows)", () => {
  const s = fresh();
  s.set("t", "A", {x: 1}); s.set("t", "a", {x: 2}); s.set("T", "a", {x: 3}); s.set("t", "CON", {x: 4}); s.set("t", "A:b", {x: 5});
  assert.deepEqual(s.get("t", "A"), {id: "A", version: 1, data: {x: 1}});
  assert.deepEqual(s.get("t", "a"), {id: "a", version: 1, data: {x: 2}});
  assert.deepEqual(s.get("T", "a").data, {x: 3});
  assert.deepEqual(s.list("t").map(d => d.id).sort(), ["A", "A:b", "CON", "a"]);
  assert.deepEqual(s.collections().sort(), ["T", "t"]);
  const names = readdirSync(join(s.dir, readdirSync(s.dir).find(n => n === "t")));
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, names.length);
});

test("store: an id whose encoded file name is too long, and a __proto__ field, are rejected", () => {
  const s = fresh();
  assert.throws(() => s.set("t", "X".repeat(150), {}), e => e.code === "invalid");
  assert.throws(() => s.set("t", ":".repeat(100), {}), e => e.code === "invalid");
  assert.equal(s.set("t", "X".repeat(100), {}).version, 1);
  assert.throws(() => s.update("t", "p", JSON.parse('{"__proto__": {"a": 1}}')), e => e.code === "invalid");
  assert.throws(() => s.append("t", "p", "__proto__", 1), e => e.code === "invalid");
  assert.equal(s.get("t", "p"), null);
});

const docs = [{id: "a", data: {date: "2026-10-01", n: 3, s: "x"}}, {id: "b", data: {date: "2026-10-14", n: 1}}, {id: "c", data: {date: "2026-10-20", n: 2, s: "y"}}];
const ids = r => r.map(d => d.id);

test("query: each operator", () => {
  assert.deepEqual(ids(runQuery(docs, [["n", "==", 1]])), ["b"]);
  assert.deepEqual(ids(runQuery(docs, [["n", "!=", 1]])), ["a", "c"]);
  assert.deepEqual(ids(runQuery(docs, [["n", "<", 2]])), ["b"]);
  assert.deepEqual(ids(runQuery(docs, [["n", "<=", 2]])), ["b", "c"]);
  assert.deepEqual(ids(runQuery(docs, [["n", ">", 2]])), ["a"]);
  assert.deepEqual(ids(runQuery(docs, [["n", ">=", 2]])), ["a", "c"]);
  assert.throws(() => matches({n: 1}, [["n", "in", [1]]]));
});

test("query: chained where (the Time page's date range), orderBy asc/desc, missing fields", () => {
  assert.deepEqual(ids(runQuery(docs, [["date", ">=", "2026-10-02"], ["date", "<=", "2026-10-19"]])), ["b"]);
  assert.deepEqual(ids(runQuery(docs, [], ["n", "asc"])), ["b", "c", "a"]);
  assert.deepEqual(ids(runQuery(docs, [], ["n", "desc"])), ["a", "c", "b"]);
  assert.deepEqual(ids(runQuery(docs, [["s", "!=", "x"]])), ["c"]);
  assert.deepEqual(ids(runQuery(docs, [], ["s", "desc"])), ["c", "a", "b"]);
  assert.deepEqual(ids(runQuery(docs, [], ["s", "asc"])), ["a", "c", "b"]);
});
