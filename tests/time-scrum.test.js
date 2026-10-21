import {test} from "node:test";
import assert from "node:assert/strict";
import {scrumSummary, scrumText} from "../js/time/scrum.js";

const D = "2026-10-19", at = (hm, d = D) => `${d}T${hm}:00`;
const seg = (session, ticket, a, b) => ({session, ticket, start: new Date(at(a)).toISOString(), end: new Date(at(b)).toISOString()});
const stg = (...p) => p.map(([label, state]) => ({label, state}));
const sessions = [
  {id: "s1", data: {title: "Search bar", ticket: "17983", now: "refuter reviewing", pr: {id: 6254, status: "draft"}, events: [
    {at: at("11:30"), text: "refuter ACCEPT", card: "c1"},
    {at: at("09:20"), text: "committed 581a23a31", card: "c1"},
    {at: at("08:10"), text: "builder dispatched", card: "c1"},
    {at: at("09:40"), text: "ordinary chatter"},
    {at: at("09:45", "2026-10-20"), text: "committed tomorrow"}]}},
  {id: "s2", data: {title: "Fee rework", ticket: "17980", completed: at("12:00", "2026-10-18"), events: [{at: at("10:00"), text: "REWORK: missing null guard", card: "c2"}]}},
  {id: "s3", data: {title: "Gateway", ticket: "17980", now: "building", events: [
    {at: at("10:00"), text: "builder dispatched", card: "c3"},
    {at: at("10:30"), text: "REWORK: tenant filter missing", card: "c3"},
    {at: at("10:50"), text: "REWORK: still missing the guard", card: "c3"}]}}
];
const cards = [
  {_id: "c1", session: "s1", ticket: "17983", title: "Search bar rework", stages: stg(["Build", "done"], ["Review", "done"], ["Docs", "pending"], ["PR", "pending"])},
  {_id: "c3", session: "s3", ticket: "17980", title: "Fee gateway", stages: stg(["Build", "done"], ["Review", "rework"])}
];
const segments = [seg("s1", "PET-17983*", "08:00", "09:00"), seg("s1", "17983", "10:00", "10:45"), seg("s3", "PET-17980", "10:50", "11:20"), seg("s4", "UNKNOWN", "13:00", "13:10")];

test("yesterday: a line per ticket, most driven time first, with that day's outcomes in time order", () => {
  const r = scrumSummary({date: D, segments, sessions, cards, notes: {}});
  assert.equal(r.yesterday[0], "PET-17983 Search bar, 1h 45m: committed 581a23a31; refuter ACCEPT");
  assert.equal(r.yesterday[1], "PET-17980 Fee rework, 30m: REWORK: missing null guard; REWORK: tenant filter missing; REWORK: still missing the guard");
  assert.equal(r.yesterday[2], "No ticket, 10m");
  assert.equal(r.yesterday.length, 3);
});

test("yesterday: with no board events the line falls back to the timeline note, and to the bare ticket", () => {
  const r = scrumSummary({date: D, segments: [seg("x", "PET-5", "09:00", "10:00"), seg("y", "PET-6", "11:00", "11:20")], sessions: [], cards: [], notes: {"PET-5": "Added the export button"}});
  assert.deepEqual(r.yesterday, ["PET-5, 1h: Added the export button", "PET-6, 20m"]);
});

test("today: an unfinished session gives its now line, first pending stage and a draft PR", () => {
  const r = scrumSummary({date: D, segments, sessions, cards});
  assert.ok(r.today.includes("Search bar: refuter reviewing; next: Docs; PR #6254 (draft)"));
  assert.ok(r.today.includes("Gateway: building"));
  assert.ok(!r.today.some(l => l.startsWith("Fee rework")), "a session finished before the day ended is not listed");
});

test("today: a final PR status is not shown; every open session started by day end is listed, active or not", () => {
  const s = [{id: "a", data: {title: "A", now: "x", pr: {id: 1, status: "completed"}, events: [{at: at("09:00"), text: "e"}]}},
    {id: "b", data: {title: "B", now: "y", started: at("09:00", "2026-10-10"), events: []}},
    {id: "c", data: {title: "C", now: "z", started: at("09:00", "2026-10-21"), events: []}},
    {id: "d", data: {title: "D", now: "w", completed: at("09:00", "2026-10-20"), status: "Done", started: at("08:00"), events: []}}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: s, cards: []}).today, ["A: x", "B: y", "D: w"]);
});

test("today: the next pending stage follows card order", () => {
  const cs = [{_id: "z", session: "s", order: 2, stages: stg(["Docs", "pending"])}, {_id: "y", session: "s", order: 1, stages: stg(["Build", "done"], ["Review", "pending"])}];
  const r = scrumSummary({date: D, segments: [], sessions: [{id: "s", data: {title: "T", events: []}}], cards: cs});
  assert.deepEqual(r.today, ["T; next: Review"]);
});

test("yesterday: durations round total minutes first; abandoned and uncommitted are not outcomes", () => {
  const sg = [{session: "s1", ticket: "PET-1", start: new Date(at("10:00")).toISOString(), end: new Date(`${D}T11:59:40`).toISOString()}];
  const ss = [{id: "s1", data: {ticket: "1", events: [{at: at("10:30"), text: "abandoned the spike"}, {at: at("10:40"), text: "uncommitted changes remain"}, {at: at("11:00"), text: "PR opened"}]}}];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: []}).yesterday, ["PET-1, 2h: PR opened"]);
});

test("blockers: with no REWORK event on the card, another card's reason is never used", () => {
  const ss = [{id: "s", data: {ticket: "9", events: [{at: at("10:00"), text: "REWORK: card a reason", card: "a"}]}}];
  const cs = [{_id: "b", session: "s", ticket: "9", title: "B", stages: stg(["Review", "rework"])}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: in rework"]);
  ss[0].data.events.push({at: at("10:30"), text: "REWORK: session level"});
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: REWORK: session level"]);
});

test("blockers: a card still in rework gives the text of the last REWORK event", () => {
  const r = scrumSummary({date: D, segments, sessions, cards});
  assert.deepEqual(r.blockers, ["PET-17980 Fee gateway: REWORK: still missing the guard"]);
  assert.deepEqual(scrumSummary({date: D, segments, sessions, cards: [cards[0]]}).blockers, ["None"]);
});

test("blockers: a finished session, a session begun after the day, or a rework begun after it is not that day's blocker", () => {
  const rw = (started) => [{label: "Build", state: "rework", ...(started ? {started} : {})}];
  const cs = [{_id: "a", session: "done", ticket: "1", title: "A", stages: rw()},
    {_id: "b", session: "late", ticket: "2", title: "B", stages: rw()},
    {_id: "c", session: "open", ticket: "3", title: "C", stages: rw(at("19:12", "2026-10-20"))},
    {_id: "d", session: "open", ticket: "4", title: "D", stages: rw(at("10:00"))}];
  const ss = [{id: "done", data: {status: "Done", completed: at("17:00"), events: []}},
    {id: "late", data: {started: at("18:08", "2026-10-20"), events: []}},
    {id: "open", data: {started: at("08:00"), events: []}}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-4 D: in rework"]);
});

test("blockers: a REWORK event after the day is not that day's reason", () => {
  const ss = [{id: "s", data: {ticket: "9", events: [{at: at("10:00"), text: "REWORK: day reason", card: "b"}, {at: at("09:00", "2026-10-20"), text: "REWORK: next day", card: "b"}]}}];
  const cs = [{_id: "b", session: "s", ticket: "9", title: "B", stages: stg(["Review", "rework"])}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: REWORK: day reason"]);
});

test("yesterday: pre-PR and a bare PR mention are not outcomes; the last 3 outcomes are kept", () => {
  const sg = [seg("s", "PET-1", "10:00", "11:00")];
  const ev = (hm, text) => ({at: at(hm), text});
  const ss = [{id: "s", data: {ticket: "1", events: [ev("10:00", "Pre-PR review dispatched"), ev("10:05", "Panel on PR 6218 staged 3+3"),
    ev("10:10", "committed 581a23a31"), ev("10:20", "refuter ACCEPT"), ev("10:30", "Draft PR 6246 -> develop opened"), ev("10:40", "builder done: 9 tests")]}}];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: []}).yesterday, ["PET-1, 1h: refuter ACCEPT; Draft PR 6246 -> develop opened; builder done: 9 tests"]);
  ss[0].data.events = [ev("10:00", "Pre-PR review dispatched"), ev("10:05", "Panel on PR 6218 staged 3+3"), ev("10:06", "Builder A dispatched: commit groups 1-3.")];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: []}).yesterday, ["PET-1, 1h"]);
});

test("yesterday: the title and outcomes follow the driven one of a card's task and ticket", () => {
  const sg = [seg("s1", "PET-17983", "10:00", "11:00"), seg("s2", "PET-17942", "11:00", "11:30")];
  const ss = [{id: "s1", data: {title: "Top search bar rework", ticket: "13520", started: at("09:00"), events: [{at: at("10:30"), text: "refuter ACCEPT", card: "sb"}]}},
    {id: "s2", data: {title: "Peer review PR 6218", ticket: "17942", started: at("09:30"), events: [{at: at("11:10"), text: "Commit 916f032f2", card: "pr"}]}}];
  const cs = [{_id: "later", session: "s1", order: 2, ticket: "13520", task: "17983", title: "Later card"},
    {_id: "sb", session: "s1", order: 1, ticket: "13520", task: "17983", title: "Search backend"},
    {_id: "pr", session: "s2", ticket: 17942, task: "PR 6218", title: "Org Search fix"}];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: cs}).yesterday,
    ["PET-17983 Search backend, 1h: refuter ACCEPT", "PET-17942 Peer review PR 6218, 30m: Commit 916f032f2"]);
});

test("an empty day says Nothing logged; a notify-only day yields no segments so it reads the same", () => {
  const r = scrumSummary({date: D, segments: [], sessions: [], cards: []});
  assert.deepEqual(r, {yesterday: ["Nothing logged"], today: ["None"], blockers: ["None"]});
});

test("scrumText: three headed sections of dash bullets, no HTML", () => {
  const txt = scrumText(scrumSummary({date: D, segments, sessions, cards}), D);
  assert.match(txt, /^Scrum 2026-10-19\n\nYesterday\n- PET-17983 /);
  assert.match(txt, /\n\nToday\n- /);
  assert.match(txt, /\n\nBlockers\n- PET-17980 /);
  assert.ok(!/[<>]/.test(txt));
});
