import {test} from "node:test";
import assert from "node:assert/strict";
import {dayHtml, entriesHtml, emptyHtml, withReview, weekHtml, monthHtml, scrumHtml} from "../js/time/render.js";
import {scrumText} from "../js/time/scrum.js";

const D = "2026-10-19", L = hm => new Date(`${D}T${hm}:00`).toISOString();
const count = (s, re) => (s.match(re) || []).length;
const entry = (ticket, a, b, minutes) => ({ticket, start: L(a), end: L(b), minutes, needsTicket: ticket == null});
const result = {entries: [entry("PET-17983", "11:30", "12:45", 75), entry(null, "13:00", "13:15", 15), entry("PET-17891", "21:15", "21:45", 30)], notEntered: 4, drivenMin: 118};

test("a missing timeline doc names the date and the sync command", () => {
  const h = emptyHtml(D);
  assert.match(h, /No time synced for 2026-10-19 yet/);
  assert.match(h, /sync-timeline\.ps1 -Date 2026-10-19/);
});

test("every Work Detail value is its own click-to-copy button, with portal-shaped values", () => {
  const h = entriesHtml(result, {date: D, notes: {}, flags: {}});
  // Four values on each ticketed entry, three on the needs-a-ticket one, plus one Note copy per entry.
  assert.equal(count(h, /class="v cv"/g), 11);
  assert.equal(count(h, /data-copy=/g), 14);
  assert.equal(count(h, /⧉/g), 3);
  assert.match(h, /<button type="button" class="v cv" data-copy="PET-17983" title="Click to copy" aria-label="Copy Ticket PET-17983">PET-17983<\/button>/);
  assert.match(h, /aria-label="Copy Start Time 11:30 AM">11:30 AM</);
  assert.match(h, /data-copy="PET-17983"/);
  assert.match(h, /data-copy="10\/19\/2026"/);
  assert.match(h, /data-copy="11:30 AM"/);
  assert.match(h, /data-copy="12:45 PM"/);
  // 9:15 PM EDT is the next day in UTC; the Start Date must stay the local day.
  assert.equal(count(h, /data-copy="10\/19\/2026"/g), 3);
  assert.match(h, /data-copy="9:15 PM"/);
});

test("a needsTicket entry says it needs a ticket in the Ticket field, not as a button", () => {
  const h = entriesHtml({entries: [entry(null, "13:00", "13:15", 15)], notEntered: 0, drivenMin: 15}, {date: D});
  assert.match(h, /<span class="k">Ticket<\/span><span class="v"><em class="needs">needs a ticket<\/em><\/span>/);
  assert.doesNotMatch(h, /Copy Ticket/);
  assert.match(h, /aria-label="Copy Start Date 10\/19\/2026"/);
});

test("the Day tab's empty state keeps its Scrum button; Week and Month empty states have none", () => {
  assert.match(emptyHtml(D, true), /data-scrum="2026-10-19"/);
  assert.match(emptyHtml(D, true), /No time synced for 2026-10-19 yet/);
  assert.doesNotMatch(emptyHtml(D), /data-scrum/);
});

test("Not entered shows only when non-zero, next to the day's totals", () => {
  const h = entriesHtml(result, {date: D});
  assert.match(h, /Not entered: 4 min/);
  assert.match(h, /2h entered/);
  assert.match(h, /1h 58m driven/);
  assert.doesNotMatch(entriesHtml({...result, notEntered: 0}, {date: D}), /Not entered/);
});

test("Review and Unplanned are suggestions, not switches", () => {
  const segs = [{session: "r1", ticket: "PET-17891", start: L("09:00"), end: L("09:30")},
    {session: "r1", ticket: "PET-17983", start: L("10:00"), end: L("10:30")}, {session: "s1", ticket: "17983", start: L("11:00"), end: L("11:30")}];
  const flags = withReview({"PET-17983": {unplanned: true}}, segs, {r1: {project: "Petsoft", review: true}, s1: {project: "Petsoft"}});
  assert.deepEqual(flags, {"PET-17983": {unplanned: true}, "PET-17891": {review: true}});
  const h = entriesHtml(result, {date: D, flags});
  const [, first, , third] = h.split('<li class="entry');
  assert.match(first, /Unplanned Time: on/);
  assert.match(first, /Review Time: off/);
  assert.match(third, /Review Time: on/);
  assert.doesNotMatch(h, /<input|role="switch"/);
});

test("the note is a textarea prefilled from notes, copied as typed, never saved", () => {
  const h = entriesHtml(result, {date: D, notes: {"PET-17983": "Search <cards> & results"}});
  assert.match(h, /<textarea[^>]*>Search &lt;cards&gt; &amp; results<\/textarea><button[^>]*data-copy="Search &lt;cards&gt; &amp; results"/);
  assert.doesNotMatch(h, /<form|data-save/);
});

test("the day draws a column per ticket: driving solid, agents hatched, markers as dots, db strings escaped", () => {
  const segments = [{session: "s1", ticket: "PET-17983*", start: L("08:05"), end: L("08:50")}, {session: "s2", ticket: "UNKNOWN", start: L("08:50"), end: L("09:20")},
    {session: "s1", ticket: "17983", start: L("09:35"), end: L("10:05")}];
  const spans = [{ticket: "PET-18004", card: "c6", agent: "builder dispatched", start: L("08:30"), end: L("10:00")}];
  const markers = [{session: "s1", ticket: "PET-17983", at: L("09:40")}];
  const h = dayHtml({date: D, segments, spans, markers, entries: {entries: [], notEntered: 0, drivenMin: 105}, tickets: {"PET-17983": "<b>Search</b>"}, skin: "sleek"});
  assert.equal(count(h, /class="tl-col /g), 3);
  assert.equal(count(h, /class="drv"/g), 3);
  assert.equal(count(h, /class="agt"/g), 1);
  assert.equal(count(h, /class="mk"/g), 1);
  assert.match(h, /No ticket/);
  assert.match(h, /1h 15m driven/);
  assert.match(h, /1h 30m agents/);
  assert.match(h, /&lt;b&gt;Search&lt;\/b&gt;/);
  assert.doesNotMatch(h, /<b>Search/);
  assert.match(h, /data-scrum="2026-10-19"/);
  assert.match(h, />8 AM</);
  assert.match(h, />10 AM</);
});

test("the day axis is the whole day at half-hour labels, even when activity runs 10 AM to 7 PM", () => {
  const h = dayHtml({date: D, segments: [{session: "s1", ticket: "PET-17983", start: L("10:00"), end: L("19:00")}], entries: {entries: [], notEntered: 0, drivenMin: 540}, skin: "sleek"});
  assert.match(h, /--hours:24"/);
  const labels = [...h.split('class="tl-axis"')[1].split('class="tl-col ')[0].matchAll(/<span style="top:([\d.]+)%">([^<]+)<\/span>/g)].map(m => [Number(m[1]), m[2]]);
  // 49 labels: every hour and half hour from 12 AM to the closing 12 AM.
  assert.equal(labels.length, 49);
  assert.deepEqual(labels.slice(0, 4).map(x => x[1]), ["12 AM", "12:30", "1 AM", "1:30"]);
  assert.deepEqual(labels.slice(28, 30).map(x => x[1]), ["2 PM", "2:30"]);
  assert.deepEqual(labels[48], [100, "12 AM"]);
  // The driving block sits at its real time of day, and the first scroll lands half an hour above it (9:30 AM).
  assert.match(h, /class="drv" style="top:41\.667%;height:37\.500%"/);
  assert.match(h, /data-first="0\.3958"/);
});

const Ld = (d, hm) => new Date(`${d}T${hm}:00`).toISOString();
const sg = (d, ticket, a, b) => ({session: "s1", ticket, start: Ld(d, a), end: Ld(d, b)});

test("week: seven day columns, Monday first, each with its driven total and a Scrum button", () => {
  const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
  const days = dates.map(date => ({date, segments: [], spans: []}));
  days[0].segments = [sg(dates[0], "PET-17983", "09:00", "10:30")];
  days[2].segments = [sg(dates[2], "PET-17979", "13:00", "13:45")];
  days[2].spans = [{ticket: "PET-18004", card: "c7", agent: "builder dispatched", start: Ld(dates[2], "13:10"), end: Ld(dates[2], "14:00")}];
  const h = weekHtml(days);
  assert.equal(count(h, /class="wk-col /g), 7);
  assert.deepEqual([...h.matchAll(/data-scrum="([^"]+)"/g)].map(m => m[1]), dates);
  assert.match(h.split('class="wk-col ')[1], /data-day="2026-10-12"[\s\S]*1h 30m/);
  assert.match(h.split('class="wk-col ')[3], /45m/);
  assert.match(h, /2h 15m driven/);
  assert.match(h, /class="band"/);
  assert.match(h, /<i class="agt tk-/);
  // The week axis is the whole day too; it first scrolls half an hour above the week's earliest activity (9 AM Monday).
  assert.match(h, /class="tl wk" style="--hours:24" data-first="0\.3542"/);
  // A synced week with nothing driven opens at 8 AM.
  assert.match(weekHtml(dates.map(date => ({date, segments: [], spans: []}))), /data-first="0\.3333"/);
});

test("month: Monday-first rows with leading blanks, totals, ticket bars, agent marks and week totals", () => {
  const days = [
    {date: "2026-10-01", segments: [sg("2026-10-01", "PET-17983", "09:00", "10:00"), sg("2026-10-01", "UNKNOWN", "10:00", "10:30"), sg("2026-10-01", "PET-17979", "11:00", "11:20")], spans: []},
    {date: "2026-10-06", segments: [sg("2026-10-06", "PET-17979", "09:00", "11:00")], spans: [{ticket: "PET-17979", card: "c1", agent: "x", start: Ld("2026-10-06", "09:00"), end: Ld("2026-10-06", "10:00")}]},
    {date: "2026-10-07", segments: [], spans: []}];
  const h = monthHtml("2026-10", days);
  // Oct 1 2026 is a Thursday: Mon-Wed of that row are blank.
  assert.equal(count(h.split('data-day="2026-10-01"')[0], /class="mo-cell blank"/g), 3);
  assert.equal(count(h, /class="mo-week"/g), 5);
  assert.match(h, /1h 50m/);
  const cell1 = h.split('data-day="2026-10-01"')[1].split("mo-cell")[0];
  const widths = [...cell1.matchAll(/width:([\d.]+)%/g)].map(m => Number(m[1]));
  assert.equal(widths.length, 3);
  assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.01, String(widths));
  assert.doesNotMatch(cell1, /mo-agent/);
  // Three equal thirds round to 33.33 each; the last part takes the remainder so the bar is exactly 100%.
  const thirds = monthHtml("2026-10", [{date: "2026-10-09", segments: [sg("2026-10-09", "PET-1", "09:00", "09:20"), sg("2026-10-09", "PET-2", "09:20", "09:40"), sg("2026-10-09", "PET-3", "09:40", "10:00")], spans: []}]);
  const tw = [...thirds.split('data-day="2026-10-09"')[1].split("mo-cell")[0].matchAll(/width:([\d.]+)%/g)].map(m => Number(m[1]));
  assert.equal(tw.length, 3);
  assert.equal(Math.round(tw.reduce((a, b) => a + b, 0) * 100), 10000, String(tw));
  assert.match(h.split('data-day="2026-10-06"')[1].split("mo-cell")[0], /mo-agent/);
  assert.match(h, /data-scrum="2026-10-01"/);
  assert.doesNotMatch(h, /data-scrum="2026-10-07"/);
  assert.doesNotMatch(h, /data-scrum="2026-10-03"/);
  assert.match(h, /3h 50m driven/);
  assert.match(h, /1h 50m<\/div>/);
});

test("scrum: the three sections as preformatted text and one Copy button for all of it", () => {
  const summary = {yesterday: ["PET-17983 Search <cards>, 1h 45m: committed"], today: ["Search bar: refuter reviewing"], blockers: ["None"]};
  const h = scrumHtml(summary, "2026-10-19");
  const text = scrumText(summary, "2026-10-19");
  assert.match(h, /<pre[^>]*>[\s\S]*Yesterday[\s\S]*Today[\s\S]*Blockers[\s\S]*<\/pre>/);
  assert.match(h, /Search &lt;cards&gt;/);
  assert.equal(count(h, /<button/g), 1);
  assert.equal(count(h, /data-copy=/g), 1);
  assert.ok(h.includes(`data-copy="${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}"`));
});

test("the entry marker has what it needs: the day axis bounds, a hidden line, and each entry's span in ms", () => {
  const h = dayHtml({date: D, segments: [{session: "s1", ticket: "PET-17983", start: L("10:00"), end: L("11:00")}], skin: "sleek"});
  const a = new Date(`${D}T00:00:00`).getTime();
  assert.ok(h.includes(`data-a="${a}" data-b="${a + 24 * 3600000}"><i class="tl-now" aria-hidden="true" hidden></i>`));
  const e = entriesHtml(result, {date: D});
  const first = result.entries[0];
  assert.match(e, new RegExp(`data-at="${Date.parse(first.start)}" data-to="${Date.parse(first.end)}"`));
  assert.equal(count(e, /data-at="\d+" data-to="\d+"/g), result.entries.length);
});

test("the Marker button sits beside Scrum when the day has entries, pressed when the marker is on", () => {
  const seg = [{session: "s1", ticket: "PET-17983", start: L("10:00"), end: L("11:00")}];
  const on = dayHtml({date: D, segments: seg, entries: result, skin: "sleek"});
  assert.match(on, /<span class="day-acts"><button type="button" class="btn scrum tip" data-marker aria-pressed="true" aria-label="Entry marker" aria-describedby="marker-tip">Marker<span class="tip-t" id="marker-tip" role="tooltip">Hide [^<]+<\/span><\/button><button type="button" class="btn scrum" data-scrum=/);
  assert.match(dayHtml({date: D, segments: seg, entries: result, skin: "sleek", marker: false}), /data-marker aria-pressed="false"[^>]*>Marker<span class="tip-t" id="marker-tip" role="tooltip">Show /);
  // The tip is the button's description, read once: never aria-hidden, and its id is the one aria-describedby names.
  assert.ok(!on.includes("aria-hidden=\"true\">Hide"));
  assert.equal(count(on, /id="marker-tip"/g), 1);
  // The button always renders unhidden; the controller hides it where the line cannot show.
  assert.doesNotMatch(on, /<button[^>]*data-marker[^>]*hidden/);
  assert.ok(!dayHtml({date: D, segments: seg, entries: {entries: [], notEntered: 0, drivenMin: 60}, skin: "sleek"}).includes("data-marker"));
});
