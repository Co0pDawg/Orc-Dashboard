import {test} from "node:test";
import assert from "node:assert/strict";
import {touchedOn, visibleSessions, doneCount, liveIds} from "../js/model.js";
import {hashDay, pageHash, fmtDay} from "../js/util.js";

// Local wall-clock times, so the midnight edges hold in any time zone the tests run in.
const at = (d, h = 12, m = 0) => { const [y, mo, da] = d.split("-").map(Number); return new Date(y, mo - 1, da, h, m).toISOString(); };
const D = "2026-10-20", NEXT = "2026-10-21";
const sess = (id, data = {}) => ({id, data});

test("touchedOn: each session source counts on its local day", () => {
  for (const k of ["started", "updated", "completed"]) assert.equal(touchedOn(sess("s", {[k]: at(D)}), D), true, k);
  assert.equal(touchedOn(sess("s", {events: [{at: at(D)}]}), D), true, "event");
  assert.equal(touchedOn(sess("s", {events: [{at: at("2026-10-14"), sub: [{at: at(D)}]}]}), D), true, "sub-event");
});

test("touchedOn: the session's cards count by update, progress line and stage start; other sessions' cards do not", () => {
  const s = sess("s", {started: at("2026-10-14"), updated: at("2026-10-14")});
  assert.equal(touchedOn(s, D, [{session: "s", updated: at(D)}]), true, "card updated");
  assert.equal(touchedOn(s, D, [{session: "s", progress: [{at: at(D), text: "build green"}]}]), true, "progress line only");
  assert.equal(touchedOn(s, D, [{session: "s", stages: [{label: "Build", state: "active", started: at(D)}]}]), true, "stage started");
  assert.equal(touchedOn(s, D, [{session: "s", stages: {build: {state: "active", started: at(D)}}}]), true, "object-shaped stages");
  assert.equal(touchedOn(s, D, [{session: "other", updated: at(D), progress: [{at: at(D)}]}]), false, "another session's card");
});

test("touchedOn: another day, a bad date and the local-midnight edges", () => {
  const spans = sess("s", {started: at("2026-10-14"), updated: at("2026-10-19"), events: [{at: at("2026-10-14")}, {at: at("2026-10-19")}]});
  assert.equal(touchedOn(spans, "2026-10-14"), true);
  assert.equal(touchedOn(spans, "2026-10-16"), false, "a day between its start and its last touch");
  assert.equal(touchedOn(sess("s", {started: "garbage", updated: null, events: [{at: "nope"}]}), D, [{session: "s", updated: "bad", progress: [{at: "x"}]}]), false);
  assert.equal(touchedOn(sess("s", {updated: at(D)}), "not-a-date"), false);
  const late = sess("s", {updated: at(D, 23, 59)}), midnight = sess("s", {updated: at(NEXT, 0, 0)});
  assert.equal(touchedOn(late, D), true, "23:59 is still the day");
  assert.equal(touchedOn(late, NEXT), false);
  assert.equal(touchedOn(midnight, NEXT), true, "00:00 starts the next day");
  assert.equal(touchedOn(midnight, D), false);
});

test("visibleSessions by day: today keeps finished behind Show finished; a past day always shows them", () => {
  const sessions = [sess("live", {updated: at(D)}), sess("fin", {completed: at(D), updated: at(D)}), sess("old", {updated: at("2026-10-14")}), sess("oldfin", {completed: at("2026-10-14")})];
  const on = s => touchedOn(s, D);
  assert.deepEqual(visibleSessions(sessions, false, "fable", on).map(s => s.id), ["live"], "today, finished hidden");
  assert.deepEqual(visibleSessions(sessions, true, "fable", on).map(s => s.id), ["live", "fin"], "today, finished shown");
  assert.deepEqual(visibleSessions(sessions, false, "fable", on, true).map(s => s.id), ["live", "fin"], "past day shows finished");
  assert.deepEqual(visibleSessions(sessions, false, "fable", s => touchedOn(s, "2026-10-16"), true), [], "nothing touched");
});

test("doneCount: the day's finished sessions only, and 0 on a past day", () => {
  const sessions = [sess("fin", {completed: at(D)}), sess("fin2", {status: "Done", updated: at(D)}), sess("oldfin", {completed: at("2026-10-14")}), sess("live", {updated: at(D)})];
  const on = s => touchedOn(s, D);
  assert.equal(doneCount(sessions, "fable", on), 2);
  assert.equal(doneCount(sessions, "fable", on, true), 0);
  assert.equal(doneCount(sessions, "fable"), 3, "no day filter counts every finished session");
});

test("liveIds on a day: the saved list filtered to the day's chips, else the newest touched", () => {
  const sessions = [sess("a", {updated: at(D)}), sess("b", {updated: at(D)}), sess("x", {updated: at("2026-10-14")})];
  const vis = visibleSessions(sessions, false, "fable", s => touchedOn(s, D));
  assert.deepEqual(liveIds(["x", "b"], vis), ["b"]);
  assert.deepEqual(liveIds(["x"], vis), ["a"]);
  assert.deepEqual(liveIds(["x"], []), []);
});

test("hashDay and pageHash: parse and format the day in a page hash", () => {
  assert.equal(hashDay("#board-2026-10-19"), "2026-10-19");
  assert.equal(hashDay("#leet-time-week-2026-10-14"), "2026-10-14");
  assert.equal(hashDay("#board"), "");
  assert.equal(hashDay(""), "");
  assert.equal(hashDay("#board-2026-13-45"), "", "an impossible date");
  assert.equal(hashDay("#board-2026-02-30"), "", "a day Date would roll over into March");
  assert.equal(hashDay("#time-2026-02-29"), "", "no leap day in 2026");
  assert.equal(hashDay("#time-2028-02-29"), "2028-02-29");
  assert.equal(pageHash("board", "2026-10-19", "2026-10-22"), "board-2026-10-19");
  assert.equal(pageHash("board", "2026-10-22", "2026-10-22"), "board", "today is the plain page");
  assert.equal(pageHash("time", false, "2026-10-22"), "time", "no picked day");
  assert.equal(hashDay("#" + pageHash("board", "2026-10-19", "2026-10-22")), "2026-10-19", "round trip");
  assert.match(fmtDay("2026-10-20"), /Oct/);
  assert.match(fmtDay("2026-10-20"), /20/);
});
