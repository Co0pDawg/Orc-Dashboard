import {test} from "node:test";
import assert from "node:assert/strict";
import {searchSessions, lastTouched, keepOpened} from "../js/search.js";

const at = (d, h = 12) => { const [y, m, da] = d.split("-").map(Number); return new Date(y, m - 1, da, h).toISOString(); };
const sess = (id, data) => ({id, data});
const S = [
  sess("2026-10-19-petsoft-search", {title: "Header search card results", ticket: "17983", branch: "feature/17983-rework-the-top-search-bar", updated: at("2026-10-19")}),
  sess("2026-10-14-petsoft-peer-review", {title: "Peer review: fee rounding", ticket: "18004", branch: "review/6250-fix", updated: at("2026-10-19", 15), started: at("2026-10-14")}),
  sess("2026-10-02-cal", {title: "Facility Calendar", ticket: "17994", branch: "feature/17994-facility-calendar", updated: at("2026-10-02")}),
  sess("2026-09-20-scrum", {title: "Scrum notes 1798 cleanup", ticket: "", branch: "feature/scrum-highlevel", updated: at("2026-10-05")}),
  sess("2026-09-01-card", {title: "Old misc", updated: at("2026-09-01")})
];
const C = [{_id: "k1", session: "2026-09-01-card", ticket: "15000", task: "17988", title: "Something", updated: at("2026-09-02")}];
const ids = q => searchSessions(S, C, q).hits.map(h => h.s.id);

test("partial ticket number: own ticket and a card's task match, ticket hits outrank a title hit", () => {
  assert.deepEqual(ids("1798"), ["2026-10-19-petsoft-search", "2026-09-01-card", "2026-09-20-scrum"]);
});
test("ticket forms: PET-17983, #17983 and the bare number", () => {
  for (const q of ["PET-17983", "#17983", "17983", "pet 17983"]) assert.deepEqual(ids(q), ["2026-10-19-petsoft-search"], q);
  // No "pet" anywhere else in this session, so the PET- prefix itself must be dropped.
  assert.deepEqual(searchSessions([sess("rise", {title: "Rise", ticket: "4512"})], [], "PET-4512").hits.length, 1);
});
test("title words: every word must appear, any order, any case", () => {
  assert.deepEqual(ids("calendar FACILITY"), ["2026-10-02-cal"]);
  assert.deepEqual(ids("facility rounding"), []);
});
test("branch fragments and the session id; punctuation is ignored", () => {
  assert.deepEqual(ids("scrum-highlevel"), ["2026-09-20-scrum"]);
  assert.deepEqual(ids("peer-review"), ["2026-10-14-petsoft-peer-review"]);
  assert.deepEqual(ids("review/6250"), ["2026-10-14-petsoft-peer-review"]);
  assert.deepEqual(ids("2026-10-02"), ["2026-10-02-cal"]);
});
test("a card-only match: the session matches through its card's task", () => {
  assert.deepEqual(ids("17988"), ["2026-09-01-card"]);
});
test("no matches and an empty query", () => {
  assert.deepEqual(searchSessions(S, C, "zzz"), {hits: [], more: 0});
  assert.deepEqual(searchSessions(S, C, "  ;; "), {hits: [], more: 0});
});
test("cap of 8 with the N more count, newest touch first", () => {
  const many = Array.from({length: 11}, (_, i) => sess("s" + i, {title: "Batch " + i, updated: at(`2026-10-${String(i + 1).padStart(2, "0")}`)}));
  const r = searchSessions(many, [], "batch");
  assert.equal(r.hits.length, 8); assert.equal(r.more, 3);
  assert.equal(r.hits[0].s.id, "s10");
});
test("lastTouched: the latest of the session's and its cards' touches", () => {
  assert.equal(lastTouched(S[1]), at("2026-10-19", 15));
  assert.equal(lastTouched(S[4], C), at("2026-09-02"));
  assert.equal(lastTouched(sess("x", {updated: "bad"})), null);
});
test("keepOpened: a pinned result drops once the day moves or it leaves the shown list", () => {
  const o = {id: "s", day: "2026-10-22"};
  assert.equal(keepOpened(o, "2026-10-22", ["s"]), true);
  assert.equal(keepOpened(o, "2026-10-21", ["s"]), false, "another day");
  assert.equal(keepOpened(o, "2026-10-22", ["t"]), false, "another session shown");
  assert.equal(keepOpened(null, "2026-10-22", ["s"]), false);
});
