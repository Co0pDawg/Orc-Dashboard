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
  assert.equal(r.yesterday[0], "PET-17983 Search bar rework, 1h 45m: committed 581a23a31; refuter ACCEPT");
  assert.equal(r.yesterday[1], "PET-17980 Fee gateway, 30m: REWORK: missing null guard; REWORK: tenant filter missing; REWORK: still missing the guard");
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
