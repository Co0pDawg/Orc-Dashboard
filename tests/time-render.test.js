import {test} from "node:test";
import assert from "node:assert/strict";
import {dayHtml, entriesHtml, emptyHtml, withReview} from "../js/time/render.js";

const D = "2026-10-19", L = hm => new Date(`${D}T${hm}:00`).toISOString();
const count = (s, re) => (s.match(re) || []).length;
const entry = (ticket, a, b, minutes) => ({ticket, start: L(a), end: L(b), minutes, needsTicket: ticket == null});
const result = {entries: [entry("PET-17983", "11:30", "12:45", 75), entry(null, "13:00", "13:15", 15), entry("PET-17891", "21:15", "21:45", 30)], notEntered: 4, drivenMin: 118};

test("a missing timeline doc names the date and the sync command", () => {
  const h = emptyHtml(D);
  assert.match(h, /No time synced for 2026-10-19 yet/);
  assert.match(h, /sync-timeline\.ps1 -Date 2026-10-19/);
});

test("every entry has a copy button per Work Detail field, with portal-shaped values", () => {
  const h = entriesHtml(result, {date: D, notes: {}, flags: {}});
  assert.equal(count(h, /data-copy=/g), 15);
  assert.match(h, /data-copy="PET-17983"/);
  assert.match(h, /data-copy="10\/19\/2026"/);
  assert.match(h, /data-copy="11:30 AM"/);
  assert.match(h, /data-copy="12:45 PM"/);
  // 9:15 PM EDT is the next day in UTC; the Start Date must stay the local day.
  assert.equal(count(h, /data-copy="10\/19\/2026"/g), 3);
  assert.match(h, /data-copy="9:15 PM"/);
});

test("a needsTicket entry copies an empty Ticket and says it needs a ticket", () => {
  const h = entriesHtml({entries: [entry(null, "13:00", "13:15", 15)], notEntered: 0, drivenMin: 15}, {date: D});
  assert.match(h, /data-copy=""/);
  assert.match(h, /needs a ticket/);
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
