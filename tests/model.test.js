import {test} from "node:test";
import assert from "node:assert/strict";
import {cardState, stagesOf, stageSince, isDone, subsOf, lastAt, liveIds, visibleSessions, progress, prFinal, mergeOrder} from "../js/model.js";
import {ago, esc, adoUrl} from "../js/util.js";

const stages = (...s) => ({stages: s.map(state => ({label: state, state}))});
const minsAgo = m => new Date(Date.now() - m * 60000).toISOString();

test("cardState: rework beats active beats done; skipped counts as done; else pending", () => {
  assert.equal(cardState(stages("done", "active", "rework")), "rework");
  assert.equal(cardState(stages("done", "active", "pending")), "active");
  assert.equal(cardState(stages("done", "skipped")), "done");
  assert.equal(cardState(stages("done", "pending")), "pending");
  assert.equal(cardState({}), "pending");
});

test("stageSince: rework stage first, its started over the card's updated", () => {
  const c = {updated: "2026-10-19T10:00:00Z", stages: [
    {state: "active", started: "2026-10-19T09:00:00Z"},
    {state: "rework", started: "2026-10-19T08:00:00Z"}]};
  assert.equal(stageSince(c), "2026-10-19T08:00:00Z");
  assert.equal(stageSince({updated: "U", stages: [{state: "active"}]}), "U");
  assert.equal(stageSince({updated: "U", stages: [{state: "done"}]}), null);
});

test("isDone: completed field, or status Done/complete/finished in any case", () => {
  assert.equal(isDone({data: {completed: "2026-10-19T10:00:00Z"}}), true);
  for (const status of ["Done", "COMPLETE", "completed", "Finished"]) assert.equal(isDone({data: {status}}), true, status);
  assert.equal(isDone({data: {status: "building"}}), false);
  assert.equal(isDone({data: {status: "not done"}}), false);
  assert.equal(isDone({data: {}}), false);
});

test("subsOf: own subs plus the card's progress from this dispatch to the next one for the card, sorted", () => {
  const events = [
    {at: "2026-10-19T10:00:00Z", text: "builder dispatched", card: "c1", sub: [{at: "2026-10-19T10:30:00Z", text: "own check-in"}]},
    {at: "2026-10-19T10:10:00Z", text: "other card", card: "c2"},
    {at: "2026-10-19T11:00:00Z", text: "refuter dispatched", card: "c1"}];
  const cards = [{_id: "c1", progress: [
    {at: "2026-10-19T09:59:00Z", text: "before"},
    {at: "2026-10-19T10:20:00Z", text: "build green"},
    {at: "2026-10-19T10:05:00Z", text: "spec read"},
    {at: "2026-10-19T11:00:00Z", text: "refuter start"}]}];
  assert.deepEqual(subsOf(events, 0, cards).map(x => x.text), ["spec read", "build green", "own check-in"]);
  assert.deepEqual(subsOf(events, 2, cards).map(x => x.text), ["refuter start"]);
  assert.deepEqual(subsOf(events, 1, cards), []);
});

test("lastAt: counts sub-events and card progress, ignores bad dates", () => {
  const events = [{at: "2026-10-19T10:00:00Z", sub: [{at: "2026-10-19T12:00:00Z"}, {at: "garbage"}]}, {at: "nope"}];
  assert.equal(lastAt(events), "2026-10-19T12:00:00Z");
  assert.equal(lastAt(events, [{progress: [{at: "2026-10-19T13:00:00Z"}, {at: "bad"}]}]), "2026-10-19T13:00:00Z");
  assert.equal(lastAt([{at: "bad"}]), null);
});

test("liveIds: drops hidden finished sessions; falls back to the newest unfinished", () => {
  const sessions = [{id: "new", data: {}}, {id: "old", data: {}}, {id: "fin", data: {status: "Done"}}];
  assert.deepEqual(liveIds(["fin", "old"], visibleSessions(sessions, false)), ["old"]);
  assert.deepEqual(liveIds(["fin"], visibleSessions(sessions, false)), ["new"]);
  assert.deepEqual(liveIds(["fin"], visibleSessions(sessions, true)), ["fin"]);
  assert.deepEqual(liveIds([], []), []);
});

test("visibleSessions: unfinished first, finished after only when shown", () => {
  const sessions = [{id: "fin", data: {completed: "x"}}, {id: "a", data: {}}];
  assert.deepEqual(visibleSessions(sessions, true).map(s => s.id), ["a", "fin"]);
  assert.deepEqual(visibleSessions(sessions, false).map(s => s.id), ["a"]);
});

test("ago: minutes, hours and days", () => {
  assert.equal(ago(minsAgo(59)), "59m");
  assert.equal(ago(minsAgo(61)), "1h 1m");
  assert.equal(ago(minsAgo(25 * 60)), "1d 1h");
  assert.equal(ago(minsAgo(-5)), "0m");
});

test("esc: escapes the five HTML characters and nullish input", () => {
  assert.equal(esc(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0");
});

test("adoUrl: Petsoft by default, the session's org/project when given, default when malformed", () => {
  assert.equal(adoUrl(17983), "https://dev.azure.com/Cosairus/Petsoft/_workitems/edit/17983");
  assert.equal(adoUrl("18001", "Cosairus/Cosairus Payment Services"), "https://dev.azure.com/Cosairus/Cosairus%20Payment%20Services/_workitems/edit/18001");
  assert.equal(adoUrl(1, "no-slash"), "https://dev.azure.com/Cosairus/Petsoft/_workitems/edit/1");
  assert.equal(adoUrl(1, "a/b/c"), "https://dev.azure.com/Cosairus/Petsoft/_workitems/edit/1");
  assert.equal(adoUrl(`1" onmouseover="x`), "https://dev.azure.com/Cosairus/Petsoft/_workitems/edit/1%22%20onmouseover%3D%22x");
});

test("stagesOf: reads the array contract and the object shape writers have used", () => {
  const arr = [{label: "Build", state: "done"}, null, {label: "Refute", state: "active"}];
  assert.deepEqual(stagesOf({stages: arr}).map(s => s.label), ["Build", "Refute"]);
  assert.deepEqual(stagesOf({stages: {build: "done", refute: "active", commit: "pending"}}),
    [{label: "Build", state: "done"}, {label: "Refute", state: "active"}, {label: "Commit", state: "pending"}]);
  assert.deepEqual(stagesOf({stages: {build: {state: "active", started: "2026-10-20T12:05:00-04:00"}}}),
    [{label: "Build", state: "active", started: "2026-10-20T12:05:00-04:00"}]);
  assert.deepEqual(stagesOf({}), []);
  const card = {stages: {build: "done", refute: "active", review: "pending", commit: "pending"}};
  assert.equal(cardState(card), "active");
  assert.deepEqual(progress([card]), {all: 4, done: 1, tickets: 1, ticketsDone: 0});
});

test("isDone with the pr setting: a finished session waits for a final PR status", () => {
  const sess = (data) => ({id: "s", data});
  const done = {completed: "2026-10-20T12:00:00-04:00"};
  assert.equal(isDone(sess({...done, pr: {id: 6240, status: "active"}})), true, "default mode ignores the PR");
  assert.equal(isDone(sess({...done, pr: {id: 6240, status: "draft"}}), "pr"), false);
  assert.equal(isDone(sess({...done, pr: {id: 6240, status: "active"}}), "pr"), false);
  assert.equal(isDone(sess({...done, pr: {id: 6240, status: "completed"}}), "pr"), true);
  assert.equal(isDone(sess({...done, pr: {id: 6240, status: "Abandoned"}}), "pr"), true);
  assert.equal(isDone(sess({...done}), "pr"), true, "no recorded PR finishes as before");
  assert.equal(isDone(sess({status: "Building", pr: {id: 1, status: "completed"}}), "pr"), false, "Fable still owns finishing");
  assert.equal(prFinal("merged"), true);
  const list = [sess({...done, pr: {id: 1, status: "active"}})];
  assert.equal(visibleSessions(list, false, "pr").length, 1, "an awaiting session stays on the chips");
  assert.equal(visibleSessions(list, false, "fable").length, 0);
});

test("mergeOrder: ids a reorder did not see go back after the id they followed", () => {
  // c1 (hidden, done) followed the log; c3 (hidden) followed c2. c2 is dragged to the front.
  assert.deepEqual(mergeOrder(["log", "c1", "c2", "c3", "c4"], ["c2", "log", "c4"]), ["c2", "c3", "log", "c1", "c4"]);
  // A hidden id first in the old order stays first; nothing hidden leaves the new order as it is.
  assert.deepEqual(mergeOrder(["c1", "log", "c2"], ["c2", "log"]), ["c1", "c2", "log"]);
  assert.deepEqual(mergeOrder(["log", "c1", "c2"], ["c2", "c1", "log"]), ["c2", "c1", "log"]);
  // Two hidden ids in a row keep their order behind the visible id before them.
  assert.deepEqual(mergeOrder(["log", "c1", "c2", "c3"], ["c3", "log"]), ["c3", "log", "c1", "c2"]);
});
