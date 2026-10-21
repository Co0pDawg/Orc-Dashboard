import {test} from "node:test";
import assert from "node:assert/strict";
import {normTicket, drivingSegments, agentSpans, agentMarkers, cardTicket} from "../js/time/segments.js";

// Times are local (no offset) so the tests hold in any time zone; hm() reads them back as local HH:MM.
const D = "2026-10-19", at = (hm, d = D) => `${d}T${hm}:00`;
const hm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const ev = (kind, time, session, ticket = "PET-1", d) => ({at: at(time, d), kind, session, ticket});
const day = {dayStart: at("00:00"), dayEnd: `${D}T23:59:59`};
const span = segs => segs.map(s => `${s.session} ${s.ticket} ${hm(s.start)}-${hm(s.end)}`);
const noOverlap = segs => segs.every((s, i) => i === 0 || Date.parse(segs[i - 1].end) <= Date.parse(s.start));

test("normTicket: every spelling of a PET ticket joins, everything else is null", () => {
  for (const t of ["PET-17619*", "17619", "#17619", 17619, "PET-17619", "pet-17619"]) assert.equal(normTicket(t), "PET-17619", String(t));
  for (const t of ["UNKNOWN", "PR-6243", "-", "", null, undefined, "PET-"]) assert.equal(normTicket(t), null, String(t));
});

test("a turn drives from its prompt to the stop plus the 15 minute tail", () => {
  const segs = drivingSegments([ev("prompt", "10:00", "A"), ev("stop", "10:20", "A")], day);
  assert.deepEqual(span(segs), ["A PET-1 10:00-10:35"]);
});

test("a prompt in another session cuts the tail short", () => {
  const segs = drivingSegments([ev("prompt", "10:00", "A", "PET-1"), ev("prompt", "10:10", "B", "PET-2"), ev("stop", "10:30", "A", "PET-1")], day);
  assert.deepEqual(span(segs).slice(0, 2), ["A PET-1 10:00-10:10", "B PET-2 10:10-10:25"]);
  assert.ok(noOverlap(segs));
});

test("two turns of one session within the tail make one segment", () => {
  const segs = drivingSegments([ev("prompt", "10:00", "A"), ev("stop", "10:05", "A"), ev("prompt", "10:12", "A"), ev("stop", "10:20", "A")], day);
  assert.deepEqual(span(segs), ["A PET-1 10:00-10:35"]);
});

test("no events, or only notify events, give no segments", () => {
  assert.deepEqual(drivingSegments([], day), []);
  assert.deepEqual(drivingSegments([ev("notify", "10:00", "A"), ev("notify", "11:00", "B")], day), []);
});

test("a turn with no stop ends at the session's last event plus the tail, or at now if earlier", () => {
  const evs = [ev("prompt", "10:00", "A"), ev("commit", "10:20", "A")];
  assert.deepEqual(span(drivingSegments(evs, day)), ["A PET-1 10:00-10:35"]);
  assert.deepEqual(span(drivingSegments(evs, {...day, now: at("10:25")})), ["A PET-1 10:00-10:25"]);
  assert.deepEqual(span(drivingSegments(evs, {...day, now: at("10:50")})), ["A PET-1 10:00-10:35"]);
});

test("a notify event does not extend an unfinished turn", () => {
  const evs = [ev("prompt", "10:00", "A"), ev("notify", "10:40", "A")];
  assert.deepEqual(span(drivingSegments(evs, day)), ["A PET-1 10:00-10:15"]);
});

test("overnight: events before dayStart are ignored and a late turn is clipped at dayEnd", () => {
  const evs = [ev("prompt", "23:50", "A", "PET-1", "2026-10-18"), ev("stop", "23:55", "A", "PET-1", "2026-10-18"),
    ev("prompt", "23:50", "B"), ev("stop", "23:55", "B")];
  const segs = drivingSegments(evs, day);
  assert.deepEqual(span(segs), ["B PET-1 23:50-23:59"]);
  assert.equal(Date.parse(segs[0].end), Date.parse(day.dayEnd));
  // next day sees only its own events
  const next = drivingSegments(evs, {dayStart: at("00:00", "2026-10-20"), dayEnd: at("23:59", "2026-10-20")});
  assert.deepEqual(next, []);
});

test("tail is configurable", () => {
  assert.deepEqual(span(drivingSegments([ev("prompt", "10:00", "A"), ev("stop", "10:20", "A")], {...day, tailMin: 0})), ["A PET-1 10:00-10:20"]);
});

test("a ticket change inside one session splits the segment", () => {
  const segs = drivingSegments([ev("prompt", "10:00", "A", "PET-1"), ev("stop", "10:20", "A", "PET-1"), ev("prompt", "10:30", "A", "PET-2"), ev("stop", "10:40", "A", "PET-2")], day);
  assert.deepEqual(span(segs), ["A PET-1 10:00-10:30", "A PET-2 10:30-10:55"]);
});

test("a day shaped like 2026-10-19: parallel sessions, other tickets, an unknown stretch, a turn with no stop", () => {
  const evs = [
    ev("prompt", "08:30", "S1", "PET-17983*"), ev("agent", "08:35", "S1", "PET-17983*"), ev("stop", "08:50", "S1", "PET-17983*"),
    ev("prompt", "08:55", "S2", "17994"), ev("stop", "09:20", "S2", "17994"),
    ev("prompt", "09:05", "S1", "PET-17983*"), ev("stop", "09:45", "S1", "PET-17983*"),   // cuts S2 at 09:05 then S2 gets nothing back
    ev("prompt", "09:30", "S2", "17994"), ev("stop", "09:40", "S2", "17994"),             // returns to S2, cuts S1 tail
    ev("prompt", "11:00", "S3", "PET-17619"), ev("commit", "11:20", "S3", "PET-17619"), ev("stop", "11:40", "S3", "PET-17619"),
    ev("notify", "12:00", "S3", "PET-17619"),
    ev("prompt", "13:00", "S4", "UNKNOWN"), ev("stop", "13:10", "S4", "UNKNOWN"),
    ev("prompt", "14:00", "S1", "PET-17983*"), ev("ado", "14:20", "S1", "PET-17983*")     // no stop
  ];
  const segs = drivingSegments(evs, day);
  assert.ok(noOverlap(segs));
  assert.deepEqual(span(segs), [
    "S1 PET-17983* 08:30-08:55",
    "S2 17994 08:55-09:05",
    "S1 PET-17983* 09:05-09:30",
    "S2 17994 09:30-09:55",
    "S3 PET-17619 11:00-11:55",
    "S4 UNKNOWN 13:00-13:25",
    "S1 PET-17983* 14:00-14:35"
  ]);
  assert.deepEqual(segs.map(s => normTicket(s.ticket)), ["PET-17983", "PET-17994", "PET-17983", "PET-17994", "PET-17619", null, "PET-17983"]);
  assert.ok(segs.every(s => Date.parse(s.start) >= Date.parse(day.dayStart) && Date.parse(s.end) <= Date.parse(day.dayEnd)));
  assert.equal(agentMarkers(evs).length, 1);
  assert.equal(agentMarkers(evs)[0].session, "S1");
});

const sess = (id, events, ticket = "17983") => ({id, data: {ticket, events}});

test("agentSpans: a dispatch followed by a report for the same card is one span on the card's task (not its ticket)", () => {
  const sessions = [sess("s1", [{at: at("10:00"), text: "builder dispatched", card: "c2"}, {at: at("10:40"), text: "builder done: 12 tests", card: "c2"}, {at: at("10:05"), text: "other"}])];
  const cards = [{_id: "c2", task: "17981", ticket: "17980", progress: []}];
  const spans = agentSpans(sessions, cards, day.dayStart, day.dayEnd);
  assert.equal(spans.length, 1);
  assert.deepEqual([spans[0].ticket, spans[0].card, spans[0].agent, hm(spans[0].start), hm(spans[0].end)], ["PET-17981", "c2", "builder dispatched", "10:00", "10:40"]);
});

test("agentSpans: an unanswered dispatch ends at the card's last progress line after it, else the session's updated, at most 2 h on", () => {
  const sessions = [{id: "s1", data: {ticket: "17983", updated: at("10:50"), events: [{at: at("10:00"), text: "builder dispatched", card: "c2"}]}}];
  const cards = [{_id: "c2", ticket: "17980", progress: [{at: at("09:00"), text: "old"}, {at: at("10:10"), text: "a"}, {at: at("10:30"), text: "b"}]}];
  assert.equal(hm(agentSpans(sessions, cards, day.dayStart, day.dayEnd)[0].end), "10:30");
  const none = agentSpans(sessions, [{_id: "c2", ticket: "17980"}], day.dayStart, day.dayEnd);
  assert.deepEqual([none.length, hm(none[0].end)], [1, "10:50"]);
  sessions[0].data.updated = at("18:00");
  assert.equal(hm(agentSpans(sessions, [], day.dayStart, day.dayEnd)[0].end), "12:00");
});

test("agentSpans: fc-wrapup shape, an unanswered dispatch ends at the session's next report event with no card", () => {
  const sessions = [{id: "fc", data: {ticket: "17994", updated: "2026-10-20T18:03:22", events: [
    {at: at("18:46"), text: "Rerun green. Committed #17999 as 9e7b3d56b."},
    {at: at("18:55"), text: "Pre-PR review (full tier, 7 agents) batch 1 dispatched: code-reviewer", card: "fc-wrapup"},
    {at: at("19:05"), text: "Cooper: ship it"},
    {at: at("19:15"), text: "Pre-PR review done: needs changes, 1 issue / 3 warning"},
    {at: at("19:16"), text: "builder done", card: "other"}]}}];
  const s = agentSpans(sessions, [{_id: "fc-wrapup", ticket: "17994"}], day.dayStart, day.dayEnd);
  assert.deepEqual(s.map(x => `${x.ticket} ${hm(x.start)}-${hm(x.end)}`), ["PET-17994 18:55-19:15"]);
});

test("agentSpans: a rework sent to the same builder starts a span", () => {
  const sessions = [sess("s1", [{at: at("17:05"), text: "Rework sent to the same builder.", card: "c"}, {at: at("18:25"), text: "Fresh refuter dispatched on the rework delta.", card: "c"}])];
  const s = agentSpans(sessions, [{_id: "c", ticket: "17999"}], day.dayStart, day.dayEnd);
  assert.deepEqual(s.map(x => `${hm(x.start)}-${hm(x.end)}`).slice(0, 1), ["17:05-18:25"]);
});

test("cardTicket: the driven one of task and ticket wins, else task, else ticket, else the session's", () => {
  const driven = new Set(["PET-17942", "PET-17983", "PET-17994"]);
  assert.equal(cardTicket({task: "PR 6218", ticket: 17942}, "17942", driven), "PET-17942");
  assert.equal(cardTicket({task: "PR 6218", ticket: 17942}, null), "PET-17942");
  assert.equal(cardTicket({task: "17983", ticket: "13520"}, "13520", driven), "PET-17983");
  assert.equal(cardTicket({task: "17997", ticket: "17994"}, "17994", driven), "PET-17994");
  assert.equal(cardTicket({task: "17997", ticket: "17994"}, "17994"), "PET-17997");
  assert.equal(cardTicket({task: "PR 6218"}, "#17942"), "PET-17942");
  assert.equal(cardTicket(undefined, "17983"), "PET-17983");
});

test("agentSpans: the span lands in the driven column, task or parent", () => {
  const ss = [sess("s1", [{at: at("10:00"), text: "builder dispatched", card: "a"}, {at: at("10:30"), text: "builder done", card: "a"}])];
  const on = (card, driven) => agentSpans(ss, [{_id: "a", ...card}], day.dayStart, day.dayEnd, driven)[0].ticket;
  assert.equal(on({task: "PR 6218", ticket: "17942"}, new Set(["PET-17942"])), "PET-17942");
  assert.equal(on({task: "17983", ticket: "13520"}, new Set(["PET-17983"])), "PET-17983");
  assert.equal(on({task: "17997", ticket: "17994"}, new Set(["PET-17994"])), "PET-17994");
});

test("agentSpans: card 18027 sequence gives exactly the builder and refuter runs", () => {
  const sessions = [sess("s1", [
    {at: at("16:11"), text: "builder dispatched on #18028", card: "c1"},
    {at: at("17:26"), text: "builder done: 40 tests pass", card: "c1"},
    {at: at("17:27"), text: "f37f9377c: keep the avatar ahead of the tag", card: "c1"},
    {at: at("17:29"), text: "refuter dispatched on #18028", card: "c1"},
    {at: at("17:42"), text: "refuter ACCEPT", card: "c1"}])];
  const s = agentSpans(sessions, [{_id: "c1", task: "18028", ticket: "18027"}], day.dayStart, day.dayEnd);
  assert.deepEqual(s.map(x => `${x.ticket} ${hm(x.start)}-${hm(x.end)}`), ["PET-18028 16:11-17:26", "PET-18028 17:29-17:42"]);
});

test("agentSpans: falls back to the session ticket and is clipped to the day", () => {
  const sessions = [sess("s1", [{at: at("23:00"), text: "builder dispatched", card: "c9"}, {at: at("23:00", "2026-10-20"), text: "builder done", card: "c9"}])];
  const s = agentSpans(sessions, [], day.dayStart, day.dayEnd);
  assert.equal(s[0].ticket, "PET-17983");
  assert.equal(Date.parse(s[0].end), Date.parse(day.dayEnd));
});
