import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {ticketUrl, idText, httpsUrl, fmtOr, t12Or} from "../js/util.js";
import {prFinal, prOpen, isDone, cardState, stageLabel, touchTimes, subsOf, lastAt, progressOf, eventsOf, knownState} from "../js/model.js";
import {scrub, scrumSummary} from "../js/time/scrum.js";
import {normTicket, agentSpans} from "../js/time/segments.js";
import {createConn, connText} from "../js/conn.js";
import {state} from "../js/state.js";
import {prHtml, emptyHtml} from "../js/render/shared.js";
import {sleekCard, sleekHead, sleekLog} from "../js/render/sleek.js";
import {leetCard, leetHead} from "../js/render/leet.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const gh = {links: {ticket: "https://github.com/o/r/issues/{id}", task: "https://tracker.example/t/{id}"}};

test("ticketUrl: links template first, then ado, then no link; task falls back to ticket", () => {
  assert.equal(ticketUrl("9", {...gh, ado: "contoso/AcmeApp"}), "https://github.com/o/r/issues/9");
  assert.equal(ticketUrl("9", gh, "task"), "https://tracker.example/t/9");
  assert.equal(ticketUrl("9", {links: {ticket: "https://x.test/{id}"}}, "task"), "https://x.test/9");
  assert.equal(ticketUrl("9", {ado: "contoso/AcmeApp"}, "task"), "https://dev.azure.com/contoso/AcmeApp/_workitems/edit/9");
  assert.equal(ticketUrl("9", {links: {}}), "");
  assert.equal(ticketUrl("", gh), "");
});

test("ticketUrl: the id is URL-encoded and only https:// templates are honoured", () => {
  assert.equal(ticketUrl(`A B/"x"`, {links: {ticket: "https://x.test/browse/{id}?q={id}"}}), "https://x.test/browse/A%20B%2F%22x%22?q=A%20B%2F%22x%22");
  for (const t of ["http://x.test/{id}", "javascript:alert(1)//{id}", "//x.test/{id}", "data:text/html,{id}"])
    assert.equal(ticketUrl("1", {links: {ticket: t}, ado: "contoso/AcmeApp"}), "", t);
  assert.equal(httpsUrl("https://github.com/o/r/pull/3"), "https://github.com/o/r/pull/3");
  assert.equal(httpsUrl("http://github.com/o/r/pull/3"), "");
});

test("idText: # before all-digit ids, other ids as written", () => {
  assert.equal(idText("17983"), "#17983");
  assert.equal(idText(42), "#42");
  assert.equal(idText("PROJ-9"), "PROJ-9");
  assert.equal(idText("o/r#3"), "o/r#3");
});

test("renderers: ticket links follow the session's links, ado or nothing", () => {
  state.sessions = []; state.cards = [];
  const c = {_id: "c1", ticket: "PROJ-9", task: "12", title: "T", kind: "Task", stages: []};
  const h = sleekCard(c, gh, false);
  assert.match(h, /href="https:\/\/github\.com\/o\/r\/issues\/PROJ-9"[^>]*>PROJ-9</);
  assert.match(h, /href="https:\/\/tracker\.example\/t\/12"[^>]*>#12</);
  assert.doesNotMatch(sleekCard(c, {}, false), /href=/);
  assert.doesNotMatch(leetCard(c, {}, false), /href=/);
  assert.match(leetCard(c, {ado: "contoso/AcmeApp"}, false), /dev\.azure\.com\/contoso\/AcmeApp\/_workitems\/edit\/12/);
  assert.match(sleekHead({id: "s", data: {title: "x", ticket: "77", ado: "a/b"}}, []), /_workitems\/edit\/77"[^>]*>#77</);
  assert.match(leetHead({id: "s", data: {title: "x", ticket: "PROJ-9", ...gh}}, []), /issues\/PROJ-9"[^>]*><b>PROJ-9<\/b>/);
  assert.doesNotMatch(sleekHead({id: "s", data: {title: "x", ticket: "77"}}, []), /href=/);
});

test("prHtml: any https:// PR url is a link; anything else is plain text", () => {
  assert.match(prHtml({id: 318, url: "https://github.com/o/r/pull/318", status: "open"}), /<a class="tid" href="https:\/\/github\.com\/o\/r\/pull\/318"/);
  assert.match(prHtml({id: 7, url: "https://gitlab.example/o/r/-/merge_requests/7", status: "merged"}, true), /href="https:\/\/gitlab/);
  assert.doesNotMatch(prHtml({id: 1, url: "javascript:alert(1)", status: "open"}), /href=/);
  assert.match(prHtml({id: 1, status: "open"}), /class="pr open"/);
  assert.match(prHtml({id: 1, status: "closed"}), /class="pr"/);
});

test("PR status vocabulary: final, in review, and the Settings rule", () => {
  for (const s of ["completed", "merged", "closed", "abandoned", "Merged"]) assert.equal(prFinal(s), true, s);
  for (const s of ["draft", "active", "open", "ready"]) { assert.equal(prFinal(s), false, s); assert.equal(prOpen(s), true, s); }
  const done = st => ({id: "s", data: {completed: "2026-10-19T10:00:00Z", pr: {id: 1, status: st}}});
  assert.equal(isDone(done("merged"), "pr"), true);
  assert.equal(isDone(done("closed"), "pr"), true, "closed is final like abandoned");
  assert.equal(isDone(done("open"), "pr"), false);
  assert.equal(isDone(done("ready"), "pr"), false);
  const sum = st => scrumSummary({date: "2026-10-19", sessions: [{id: "s", data: {title: "Export", started: "2026-10-19T09:00:00Z", pr: {id: 1, status: st}}}]}).today[0];
  assert.equal(sum("open"), "Export; PR in review");
  assert.equal(sum("ready"), "Export; PR in review");
  assert.equal(sum("merged"), "Export");
});

test("malformed docs: null and non-object entries are skipped, not thrown on", () => {
  const s = {id: "s", data: {started: "2026-10-19T09:00:00Z", events: [null, 3, {at: "2026-10-19T10:00:00Z", text: "ok", sub: [null, {at: "2026-10-19T10:05:00Z", text: "s"}]}]}};
  const cards = [null, {_id: "c", session: "s", stages: [null, "x"], progress: "nope"}, {_id: "d", session: "s", stages: "bad", progress: [null, {at: "2026-10-19T11:00:00Z", text: "p"}]}];
  assert.doesNotThrow(() => touchTimes(s, cards));
  assert.equal(eventsOf(s.data).length, 1);
  assert.deepEqual(eventsOf({events: "x"}), []);
  assert.deepEqual(progressOf({progress: [null]}), []);
  assert.equal(subsOf([null], 0, cards).length, 0);
  assert.equal(lastAt([null, {at: "2026-10-19T10:00:00Z", sub: "x"}], cards), "2026-10-19T11:00:00Z");
  assert.equal(cardState(cards[1]), "pending");
  assert.doesNotThrow(() => sleekLog(eventsOf(s.data), true, "s", cards.filter(Boolean)));
  assert.doesNotThrow(() => agentSpans([{id: "s", data: {events: [null, {at: "2026-10-19T10:00:00Z", card: "c", text: "dispatched"}]}}], cards, "2026-10-19T00:00:00Z", "2026-10-20T00:00:00Z"));
  assert.doesNotThrow(() => scrumSummary({date: "2026-10-19", sessions: [s], cards: [{_id: "c", session: "s", stages: [{label: "B", state: "rework"}]}]}));
});

test("unknown stage state: shown raw with the warning class and never done", () => {
  const c = {_id: "c", title: "T", stages: [{label: "Build", state: "done"}, {label: "Refute", state: "complete"}]};
  assert.equal(knownState("complete"), false);
  assert.equal(knownState("skipped"), true);
  assert.equal(cardState(c), "pending");
  assert.equal(stageLabel(c), "Refute: complete");
  assert.match(sleekCard(c, {}, false), /<li class="unknown"[^>]*><i><\/i><span>Refute: complete<\/span>/);
  assert.match(leetCard(c, {}, false), /<li class="unknown">.*\? complete/s);
  assert.equal(stageLabel({stages: [{label: "Build", state: "done"}, {label: "Refute", state: "pending"}]}), "Next: Refute", "known states unchanged");
});

test("missing or bad times render as no time", () => {
  assert.equal(fmtOr(undefined), "no time");
  assert.equal(fmtOr("garbage"), "no time");
  assert.equal(t12Or(""), "no time");
  assert.match(sleekHead({id: "s", data: {title: "x", started: "nope"}}, []), /Started <b>no time<\/b>/);
  assert.match(sleekLog([{text: "no at"}], false, "s", []), /<time>no time<\/time>/);
});

test("empty state: names the orchestrator's first write; the CLI only on the local backend", () => {
  state.sessions = []; state.skin = "sleek";
  state.db = {collection(){}};
  assert.match(emptyHtml(), /first board write creates a session/);
  assert.doesNotMatch(emptyHtml(), /local\/board\.js/);
  state.db = {backend: "local", collection(){}};
  assert.match(emptyHtml(), /<code>node local\/board\.js batch --stdin<\/code> \(README "Writing protocol"\)/);
  state.db = null;
});

test("scrub: model names from any vendor go, ordinary words stay", () => {
  assert.equal(scrub("Builder (claude-opus-5-5) fixed the header"), "Builder fixed the header");
  assert.equal(scrub("Ran gemini-3.8-flash-high and gpt-6.1-sol on the parser."), "Ran and on the parser.");
  assert.equal(scrub("Spec reviewed by sonnet, codex and Haiku"), "Spec reviewed by, and");
  assert.equal(scrub("Flashlight icon uses the pro layout for the gpts list"), "Flashlight icon uses the pro layout for the gpts list");
  assert.equal(scrub("The opusculum and the claudette stay"), "The opusculum and the claudette stay");
});

test("normTicket: APP spellings join as before; other tracker ids keep their own column", () => {
  for (const t of ["APP-17619*", "17619", "#17619", 17619, "app-17619"]) assert.equal(normTicket(t), "APP-17619", String(t));
  assert.equal(normTicket(" PROJ-9 "), "PROJ-9");
  assert.equal(normTicket("wid-42"), "wid-42");
  assert.equal(normTicket("owner/repo#12"), "owner/repo#12");
  for (const t of ["PR-6243", "APP-", "UNKNOWN", "-", "a-b", "", null]) assert.equal(normTicket(t), null, String(t));
});

test("conn: the notice flips on a failure and back on the next good load, once each", () => {
  const flips = []; let n = 0;
  const c = createConn((down, last) => flips.push([down, last]), () => "t" + ++n);
  c.fail(); c.fail();
  assert.deepEqual(flips, [[true, null]]);
  c.ok(); c.ok();
  assert.deepEqual(flips, [[true, null], [false, "t1"]]);
  c.fail();
  assert.deepEqual(flips[2], [true, "t2"]);
  assert.equal(connText(null), "Cannot reach the board server");
  assert.equal(connText("x", () => "3:05 PM"), "Board server not reachable; showing data from 3:05 PM");
});

test("shim: a failed load and a dropped stream reach subscribers, and recovery is delivered even when unchanged", async () => {
  const shim = readFileSync(root + "local/db-shim.js", "utf8"), query = readFileSync(root + "local/query.js", "utf8").replace(/^export /gm, "");
  const code = shim.replace("/*@query.js@*/", query);
  const sources = []; let fail = true;
  class FakeES { constructor(){ this.l = {}; sources.push(this); } addEventListener(t, f){ this.l[t] = f; } }
  const ctx = {window: {}, EventSource: FakeES, setTimeout, fetch: async () => {
    if (fail) throw new Error("ECONNREFUSED");
    return {ok: true, json: async () => ({docs: [{id: "s1", data: {title: "a"}}]})};
  }};
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const db = await ctx.window.claude.use("db");
  assert.equal(db.backend, "local");
  const flips = [], conn = createConn(down => flips.push(down)), seen = [];
  db.collection("sessions").onSnapshot(s => { seen.push(s.docs.length); conn.ok(); }, () => conn.fail());
  const tick = () => new Promise(r => setTimeout(r, 10));
  await tick();
  assert.deepEqual(flips, [true], "first load failed");
  fail = false; sources[0].l.open(); await tick();
  assert.deepEqual([flips, seen], [[true, false], [1]]);
  sources[0].l.error(); await tick();
  assert.deepEqual(flips, [true, false, true], "stream drop reaches the error callback");
  sources[0].l.open(); await tick();
  assert.deepEqual([flips, seen], [[true, false, true, false], [1, 1]], "unchanged data is still delivered after an error");
  sources[0].l.change({data: JSON.stringify({collections: ["sessions"]})}); await tick();
  assert.deepEqual(seen, [1, 1], "dedupe still holds while healthy");
});

test("scrub of the owner's name: no tracked text file contains it", () => {
  const name = ["co", "op", "er"].join("");
  const r = spawnSync("git", ["grep", "-n", "-i", "-I", "-w", name], {cwd: root, encoding: "utf8"});
  assert.equal(r.error, undefined);
  assert.equal(r.stdout, "", r.stdout);
});
