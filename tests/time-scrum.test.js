import {test} from "node:test";
import assert from "node:assert/strict";
import {scrumSummary, scrumText, scrub, plainSummary} from "../js/time/scrum.js";

const D = "2026-10-19", at = (hm, d = D) => `${d}T${hm}:00`;
const seg = (session, ticket, a, b) => ({session, ticket, start: new Date(at(a)).toISOString(), end: new Date(at(b)).toISOString()});
const stg = (...p) => p.map(([label, state]) => ({label, state}));
const blk = (hm, ticket, text) => ({start: at(hm), end: at(hm), ticket, text});
const sessions = [
  {id: "s1", data: {title: "Search bar", ticket: "17983", now: "refuter reviewing", pr: {id: 6254, status: "draft"}, events: [
    {at: at("11:30"), text: "refuter ACCEPT", card: "c1"},
    {at: at("09:20"), text: "committed 581a23a31", card: "c1"}]}},
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
const blocks = [blk("10:00", "PET-17983", "Development: Built the header typeahead; ran three review agents; committed 581a23a31."),
  blk("08:00", "PET-17983", "Planning: Read the work item; Scoped the search API"),
  blk("11:00", "PET-17980", "Code review: Refuted the fee diff")];

test("yesterday: a line per ticket, most driven time first, labelled by ADO title, summarized from its blocks in time order, no duration", () => {
  const r = scrumSummary({date: D, segments, sessions, cards, blocks, titles: {"PET-17983": "Rework the top search bar"}, notes: {"PET-17980": "Bug: Fee rework"}});
  assert.deepEqual(r.yesterday, ["PET-17983 Rework the top search bar: scoped the search API; built the header typeahead", "PET-17980 Fee rework", "Other work"]);
});

test("plainSummary: process clauses (agents, reviews, commits, merges, PR housekeeping, test runs) are dropped", () => {
  const s = plainSummary(["Development: Refuted the diff; ran six review agents on the PR; posted the checklist; set the release note; committed it; merged develop; read the build logs; requeued the policy; proved it by mutation; tests passing; Playwright run; builder done; dispatched a scout; retitled the PR; updated the PR description; created the draft PR; created pull request refusing tokens; linked the pull requests; made a worktree; fetched the branch; queried work items; filed a task; reviewed the round; Added the export button"]);
  assert.equal(s, "added the export button");
});

test("plainSummary: a leading category is stripped from each text, first letters lowered unless an acronym, duplicates dropped", () => {
  assert.equal(plainSummary(["Code review: Built X.", "Development: built X; PR banner shown"]), "built X; PR banner shown");
});

test("plainSummary: at most 3 clauses, whole clauses only within 160 chars, the rest dropped", () => {
  assert.equal(plainSummary(["Development: A one; b two; c three; d four"]), "a one; b two; c three");
  const a = "a".repeat(100), b = "b".repeat(50), c = "c".repeat(5);
  assert.equal(plainSummary([`${a}; ${b}; ${"c".repeat(10)}`]), `${a}; ${b}`, "a third clause past 160 is dropped, not cut");
  assert.equal(plainSummary([`${a}; ${"b".repeat(70)}; ${c}`]), a, "a clause that does not fit drops every clause after it");
  assert.equal(plainSummary([`${a}; ${"b".repeat(58)}`]).length, 160, "exactly 160 fits");
});

test("plainSummary: only a first clause over 160 chars is cut, on a word boundary, ending with an ellipsis", () => {
  assert.equal(plainSummary(["Development: " + "x".repeat(150) + " tail and more words; b two"]), "x".repeat(150) + " tail and…");
  const long = plainSummary(["Development: " + "word ".repeat(40)]);
  assert.ok(long.length <= 160 && long.endsWith("word…"), long);
  assert.equal(plainSummary(["x".repeat(150) + " abcdefghijkl more"]), "x".repeat(150) + "…", "a word across the limit is dropped whole");
});

test("scrub: hashes, PR numbers, counts, model names, arrows and the empty brackets they leave are removed", () => {
  assert.equal(scrub("Fixed 1e7d10d4b in PR 6243 (#6250): 19/19 live, 2183 pass, 0 findings (184k) -> develop [opus] (Sonnet) haiku"), "Fixed in PR: live, develop");
  assert.equal(scrub("Peer review PR #6218"), "Peer review PR");
  assert.equal(scrub("accepted defaced facade"), "accepted defaced facade", "an all-letter word is not a hash");
});

test("yesterday: no surviving block clause falls back to the note; a note that is only the ADO type and title is ignored", () => {
  const sg = [seg("x", "PET-5", "09:00", "10:00"), seg("y", "PET-6", "11:00", "11:20"), seg("z", "PET-7", "12:00", "12:10")];
  const r = scrumSummary({date: D, segments: sg, sessions: [], cards: [], blocks: [blk("09:00", "PET-5", "Code review: Refuted the diff")],
    notes: {"PET-5": "Added the export button; committed abc1234", "PET-6": "User Story: Export button", "PET-7": "Task: Something"}, titles: {"PET-6": "Export button"}});
  assert.deepEqual(r.yesterday, ["PET-5: added the export button", "PET-6 Export button", "PET-7"]);
});

test("plainSummary: a clause with 60% or more of its non-stopword words in the title is dropped", () => {
  const title = "Facility Calendar: unified month view of boarding, daycare, grooming and training";
  assert.equal(plainSummary(["Development: Made the Facility Calendar the Service Calendar Month view; built the Service Calendar month view; added a day drawer for the calendar"], title),
    "added a day drawer for the calendar");
  assert.equal(plainSummary(["Development: Made the Facility Calendar the Service Calendar Month view"]), "made the Facility Calendar the Service Calendar Month view", "no title, nothing is an echo");
});

test("yesterday: a board fallback title loses its PR framing; an ADO title is kept as it is", () => {
  const sg = [seg("a", "PET-1", "08:00", "09:00"), seg("b", "PET-2", "09:00", "09:50"), seg("c", "PET-3", "10:00", "10:40"), seg("d", "PET-4", "11:00", "11:30"), seg("e", "PET-5", "12:00", "12:20")];
  const ss = [["a", "1", "PR 6243 feedback: Rows layout + Cards/Rows toggle"], ["b", "2", "Peer review PR 6218 (Ira, Admin Org Search hotfix)"],
    ["c", "3", "Shared customer + pet avatars (PR 1 of 2)"], ["d", "4", "PR: move the dashboard sort to a cookie"], ["e", "5", "Board title"]]
    .map(([id, ticket, title]) => ({id, data: {ticket, title, events: []}}));
  const bl = [blk("12:00", "PET-5", "Development: Updated the ADO title; added the export")];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: [], blocks: bl, titles: {"PET-5": "PR: ADO title (PR 1 of 2)"}}).yesterday,
    ["PET-1 Rows layout + Cards/Rows toggle", "PET-2 Ira, Admin Org Search hotfix", "PET-3 Shared customer + pet avatars", "PET-4 move the dashboard sort to a cookie", "PET-5 PR: ADO title (PR 1 of 2): added the export"]);
});

test("yesterday: a board title is the fallback label, scrubbed", () => {
  const r = scrumSummary({date: D, segments: [seg("s", "PET-17983", "10:00", "11:00")], sessions: [{id: "s", data: {title: "PR 6243 feedback (opus)", ticket: "17983", events: []}}], cards: []});
  assert.deepEqual(r.yesterday, ["PET-17983 PR feedback"]);
});

test("today: an unfinished session gives its title, the next pending stage and PR in review, never its now line", () => {
  const r = scrumSummary({date: D, segments, sessions, cards});
  assert.ok(r.today.includes("Search bar: next up docs; PR in review"), r.today.join(" | "));
  assert.ok(r.today.includes("Gateway"));
  assert.ok(!r.today.some(l => l.startsWith("Fee rework")), "a session finished before the day ended is not listed");
});

test("today: a final PR status is not shown; every open session started by day end is listed, active or not", () => {
  const s = [{id: "a", data: {title: "A", now: "x", pr: {id: 1, status: "completed"}, events: [{at: at("09:00"), text: "e"}]}},
    {id: "b", data: {title: "B", now: "y", started: at("09:00", "2026-10-10"), events: []}},
    {id: "c", data: {title: "C", now: "z", started: at("09:00", "2026-10-21"), events: []}},
    {id: "d", data: {title: "D", now: "w", completed: at("09:00", "2026-10-20"), status: "Done", started: at("08:00"), events: []}},
    {id: "e", data: {title: "E", pr: {id: 7, status: "Active"}, events: []}}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: s, cards: []}).today, ["A", "B", "D", "E; PR in review"]);
});

test("today: the next pending stage follows card order", () => {
  const cs = [{_id: "z", session: "s", order: 2, stages: stg(["Docs", "pending"])}, {_id: "y", session: "s", order: 1, stages: stg(["Build", "done"], ["Review", "pending"])}];
  const r = scrumSummary({date: D, segments: [], sessions: [{id: "s", data: {title: "T", events: []}}], cards: cs});
  assert.deepEqual(r.today, ["T: next up review"]);
});

test("blockers: with no REWORK event on the card, another card's reason is never used", () => {
  const ss = [{id: "s", data: {ticket: "9", events: [{at: at("10:00"), text: "REWORK: card a reason", card: "a"}]}}];
  const cs = [{_id: "b", session: "s", ticket: "9", title: "B", stages: stg(["Review", "rework"])}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: changes requested"]);
  ss[0].data.events.push({at: at("10:30"), text: "REWORK: session level"});
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: session level"]);
});

test("blockers: a card still in rework gives the last REWORK event's reason", () => {
  const r = scrumSummary({date: D, segments, sessions, cards});
  assert.deepEqual(r.blockers, ["PET-17980 Fee gateway: still missing the guard"]);
  assert.deepEqual(scrumSummary({date: D, segments, sessions, cards: [cards[0]]}).blockers, ["None"]);
});

test("blockers: the reason drops REWORK, agent and model names, counts, hashes and PR numbers, caps at 120 chars, else changes requested", () => {
  const run = text => scrumSummary({date: D, segments: [], sessions: [{id: "s", data: {ticket: "9", events: [{at: at("10:00"), text, card: "b"}]}}],
    cards: [{_id: "b", session: "s", ticket: "9", title: "B 1e7d10d4b", stages: stg(["Review", "rework"])}]}).blockers[0];
  assert.equal(run("REWORK: refuter (opus) found 2 findings: tenant filter missing in PR 6243 at 1e7d10d4b, 3/5 tests"), "PET-9 B: found: tenant filter missing in PR at, tests");
  assert.equal(run("REWORK: refuter sonnet 19/19"), "PET-9 B: changes requested");
  const long = run("REWORK: " + "guard ".repeat(30));
  assert.ok(long.length <= "PET-9 B: ".length + 120 && long.endsWith("guard"), long);
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
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-4 D: changes requested"]);
});

test("blockers: a REWORK event after the day is not that day's reason", () => {
  const ss = [{id: "s", data: {ticket: "9", events: [{at: at("10:00"), text: "REWORK: day reason", card: "b"}, {at: at("09:00", "2026-10-20"), text: "REWORK: next day", card: "b"}]}}];
  const cs = [{_id: "b", session: "s", ticket: "9", title: "B", stages: stg(["Review", "rework"])}];
  assert.deepEqual(scrumSummary({date: D, segments: [], sessions: ss, cards: cs}).blockers, ["PET-9 B: day reason"]);
});

test("yesterday: the board title follows the driven one of a card's task and ticket", () => {
  const sg = [seg("s1", "PET-17983", "10:00", "11:00"), seg("s2", "PET-17942", "11:00", "11:30")];
  const ss = [{id: "s1", data: {title: "Top search bar rework", ticket: "13520", started: at("09:00"), events: []}},
    {id: "s2", data: {title: "Org Search fix", ticket: "17942", started: at("09:30"), events: []}}];
  const cs = [{_id: "later", session: "s1", order: 2, ticket: "13520", task: "17983", title: "Later card"},
    {_id: "sb", session: "s1", order: 1, ticket: "13520", task: "17983", title: "Search backend"}];
  assert.deepEqual(scrumSummary({date: D, segments: sg, sessions: ss, cards: cs}).yesterday, ["PET-17983 Search backend", "PET-17942 Org Search fix"]);
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
