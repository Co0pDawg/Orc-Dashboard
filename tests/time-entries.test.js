import {test} from "node:test";
import assert from "node:assert/strict";
import {buildEntries} from "../js/time/entries.js";
import {drivingSegments} from "../js/time/segments.js";

// Local times (no offset) so the tests hold in any time zone.
const at = hm => `2026-10-19T${hm}:00`;
const hm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const seg = (a, b, ticket = "PET-1") => ({session: "A", ticket, start: new Date(at(a)).toISOString(), end: new Date(at(b)).toISOString()});
const show = r => r.entries.map(e => `${e.ticket} ${hm(e.start)}-${hm(e.end)} ${e.minutes}`);
const overlapFree = es => es.every((e, i) => i === 0 || Date.parse(es[i - 1].end) <= Date.parse(e.start));

test("unit 1: entries equal the merged segments to the minute", () => {
  const r = buildEntries([seg("10:00", "10:20"), seg("10:20", "10:35"), seg("11:00", "11:07", "PET-2")], {unit: 1});
  assert.deepEqual(show(r), ["PET-1 10:00-10:35 35", "PET-2 11:00-11:07 7"]);
  assert.deepEqual([r.notEntered, r.drivenMin], [0, 42]);
});

test("back-to-back same-ticket segments merge; a different ticket does not", () => {
  const r = buildEntries([seg("10:00", "10:30"), seg("10:30", "11:00"), seg("11:00", "11:30", "PET-2")]);
  assert.deepEqual(show(r), ["PET-1 10:00-11:00 60", "PET-2 11:00-11:30 30"]);
});

test("unit 15 rounds 10:07-11:02 to 10:00-11:00", () => {
  assert.deepEqual(show(buildEntries([seg("10:07", "11:02")])), ["PET-1 10:00-11:00 60"]);
});

test("an idle hour keeps two entries", () => {
  assert.deepEqual(show(buildEntries([seg("10:00", "10:30"), seg("11:30", "12:00")])), ["PET-1 10:00-10:30 30", "PET-1 11:30-12:00 30"]);
});

test("a 4 minute isolated segment is not entered and is counted", () => {
  assert.deepEqual(buildEntries([seg("10:03", "10:07")]), {entries: [], notEntered: 4, drivenMin: 4});
});

test("a 4 minute segment touching a neighbor merges into it", () => {
  const r = buildEntries([seg("10:11", "10:15", "PET-2"), seg("10:15", "11:00")]);
  assert.deepEqual(show(r), ["PET-1 10:15-11:00 45"]);
  assert.equal(r.notEntered, 0);
});

test("a fragment that rounds to nothing is absorbed when it touches an entry, else counted", () => {
  const r = buildEntries([seg("10:00", "10:30"), seg("10:32", "10:36"), seg("10:50", "10:52", "PET-2"), seg("11:00", "11:30", "PET-2")]);
  assert.deepEqual(show(r), ["PET-1 10:00-10:30 30", "PET-2 11:00-11:30 30"]);
  assert.equal(r.notEntered, 2);
});

test("a 3 h 10 min segment splits into 120 + 70", () => {
  assert.deepEqual(show(buildEntries([seg("08:00", "11:10")], {unit: 1})), ["PET-1 08:00-10:00 120", "PET-1 10:00-11:10 70"]);
});

test("a null ticket needs a ticket; every non-PET spelling is null", () => {
  const r = buildEntries([seg("10:00", "10:30", "UNKNOWN"), seg("11:00", "11:30", "PR-6243"), seg("12:00", "12:30", "17619*")]);
  assert.deepEqual(r.entries.map(e => [e.ticket, e.needsTicket]), [[null, true], [null, true], ["PET-17619", false]]);
});

test("empty input gives the empty result", () => {
  assert.deepEqual(buildEntries([]), {entries: [], notEntered: 0, drivenMin: 0});
});

test("only notify events: no segments, no entries", () => {
  const segs = drivingSegments([{at: at("10:00"), kind: "notify", session: "A", ticket: "PET-1"}]);
  assert.deepEqual(buildEntries(segs), {entries: [], notEntered: 0, drivenMin: 0});
});

test("a day built from overlapping sessions never double-counts", () => {
  const e = (kind, t, session, ticket) => ({at: at(t), kind, session, ticket});
  const segs = drivingSegments([
    e("prompt", "08:30", "S1", "PET-17983*"), e("stop", "08:50", "S1", "PET-17983*"),
    e("prompt", "08:55", "S2", "17994"), e("stop", "09:20", "S2", "17994"),
    e("prompt", "09:05", "S1", "PET-17983*"), e("stop", "09:45", "S1", "PET-17983*"),
    e("prompt", "09:30", "S2", "17994"), e("stop", "09:40", "S2", "17994"),
    e("prompt", "11:00", "S3", "PET-17619"), e("stop", "11:40", "S3", "PET-17619"),
    e("prompt", "13:00", "S4", "UNKNOWN"), e("stop", "13:10", "S4", "UNKNOWN"),
    e("prompt", "14:00", "S1", "PET-17983*"), e("ado", "14:20", "S1", "PET-17983*")]);
  const r = buildEntries(segs);
  assert.equal(r.drivenMin, 25 + 10 + 25 + 25 + 55 + 25 + 35);
  assert.ok(overlapFree(r.entries));
  assert.ok(r.entries.some(x => x.needsTicket));
  assert.ok(Math.abs(r.entries.reduce((n, x) => n + x.minutes, 0) + r.notEntered - r.drivenMin) <= 15 * segs.length);
});

test("real 2026-10-20 PET-17983 11:15 AM-12:30 PM: entries touching once the fragments between them round away are one", () => {
  const sec = (a, b, ticket) => ({session: "A", ticket, start: new Date(`2026-10-20T${a}`).toISOString(), end: new Date(`2026-10-20T${b}`).toISOString()});
  const segs = [sec("11:07:55", "11:26:27", "PET-17983"), sec("11:26:27", "11:27:12", "PET-17905"), sec("11:27:12", "11:44:25", "PET-17983"),
    sec("11:44:25", "11:51:47", "PET-17403"), sec("11:51:47", "11:52:45", "PET-17983"), sec("11:52:45", "11:53:22", "PET-18018"),
    sec("11:53:22", "11:53:52", "PET-17403"), sec("11:53:52", "11:56:33", "PET-18018"), sec("11:56:33", "11:57:56", "PET-17983"),
    sec("11:57:56", "11:59:32", "PET-18018"), sec("11:59:32", "12:30:27", "PET-17983")];
  const r = buildEntries(segs);
  assert.deepEqual(show(r), ["PET-17983 11:15-12:30 75"]);
  assert.ok(Math.abs(75 + r.notEntered - r.drivenMin) <= 15 * segs.length);
});

test("touching same-ticket entries join only while the result fits maxMin", () => {
  const r = buildEntries([seg("08:00", "09:30"), seg("09:30", "09:34", "PET-2"), seg("09:34", "10:30")], {unit: 15});
  assert.deepEqual(show(r), ["PET-1 08:00-09:30 90", "PET-1 09:30-10:30 60"]);
  assert.deepEqual(show(buildEntries([seg("08:00", "08:30"), seg("08:30", "08:34", "PET-2"), seg("08:34", "09:00")])), ["PET-1 08:00-09:00 60"]);
});

test("property: 200 random days, every unit: no overlap, within one unit per source segment, capped at maxMin", () => {
  let seed = 12345;
  const rand = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const base = Date.parse(at("00:00"));
  for (let d = 0; d < 200; d++){
    const segs = []; let t = rand(120);
    for (let i = 0, n = 1 + rand(10); i < n; i++){
      const len = 1 + rand(i % 3 === 0 ? 240 : 40);
      segs.push({ticket: ["PET-1", "PET-2", "UNKNOWN", "17619"][rand(4)], start: new Date(base + t * 60000).toISOString(), end: new Date(base + (t + len) * 60000).toISOString()});
      t += len + (rand(3) === 0 ? 0 : rand(90));
    }
    for (const unit of [1, 5, 10, 15, 30]){
      const r = buildEntries(segs, {unit}), label = `day ${d} unit ${unit}`;
      assert.ok(overlapFree(r.entries), "overlap " + label);
      assert.ok(r.entries.every(x => x.minutes <= 120 && x.minutes > 0), "size " + label);
      assert.ok(Math.abs(r.entries.reduce((n, x) => n + x.minutes, 0) + r.notEntered - r.drivenMin) <= unit * segs.length, "total " + label);
    }
  }
});
