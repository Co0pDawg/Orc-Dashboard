import {test} from "node:test";
import assert from "node:assert/strict";
import {entryNotes, capWords} from "../js/time/notes.js";

const D = "2026-10-21", L = hm => new Date(`${D}T${hm}:00`).toISOString();
const entry = (ticket, a, b, waiting = false) => ({ticket, start: L(a), end: L(b), waiting});
const block = (ticket, a, b, text) => ({ticket, start: L(a), end: L(b), text});
const span = (ticket, card, agent, a, b) => ({ticket, card, agent, start: L(a), end: L(b)});

test("a driven entry joins every same-ticket block it overlaps, in time order, deduplicated", () => {
  const blocks = [block("PET-17994", "18:00", "18:30", "Second."), block("PET-17994", "17:30", "18:00", "Drawer."), block("PET-17994", "18:15", "18:30", "Second."),
    block("PET-17994", "18:30", "19:00", "Touches only.")];
  assert.deepEqual(entryNotes([entry("PET-17994", "17:45", "18:30")], {blocks}), ["Drawer.; Second."]);
});

test("a block on another ticket is ignored and the ticket note is the fallback, else empty", () => {
  const blocks = [block("PET-18025", "17:00", "18:00", "Other ticket.")];
  const notes = {"PET-17994": "Ticket note."};
  assert.deepEqual(entryNotes([entry("PET-17994", "17:15", "17:45"), entry("PET-17983", "17:15", "17:45"), entry(null, "17:15", "17:45")], {blocks, notes}), ["Ticket note.", "", ""]);
});

test("a waiting-only entry names its run's card title; with no card it uses the dispatch text", () => {
  const cards = [{_id: "c1", title: "Per-entry notes"}];
  const spans = [span("PET-17994", "c1", "builder dispatched", "14:00", "15:00"), span("PET-17994", "gone", "refuter dispatched", "14:30", "16:00"), span("PET-18025", "c9", "other", "14:00", "16:00")];
  const blocks = [block("PET-17994", "14:00", "15:00", "Block text.")];
  const r = entryNotes([entry("PET-17994", "14:15", "14:30", true), entry("PET-17994", "15:15", "15:30", true), entry("PET-17994", "14:00", "14:30")], {blocks, spans, cards});
  assert.deepEqual(r, ["Waiting on agent run: Per-entry notes", "Waiting on agent run: refuter dispatched", "Block text."]);
  assert.equal(entryNotes([entry("PET-17994", "14:15", "14:45", true)], {spans, cards})[0], "Waiting on agent runs: Per-entry notes; refuter dispatched");
});

test("a null-ticket waiting entry gets its null-ticket run; with no run it falls back to the blocks, then the ticket note", () => {
  const spans = [span(null, "c2", "scout dispatched", "09:00", "10:00"), span("PET-17994", "c1", "builder dispatched", "09:00", "10:00")];
  assert.deepEqual(entryNotes([entry(null, "09:15", "09:30", true)], {spans}), ["Waiting on agent run: scout dispatched"]);
  const blocks = [block("PET-17994", "11:00", "12:00", "Block text.")];
  assert.deepEqual(entryNotes([entry("PET-17994", "11:00", "11:15", true), entry("PET-18025", "11:00", "11:15", true)], {blocks, spans, notes: {"PET-18025": "Ticket note."}}), ["Block text.", "Ticket note."]);
});

test("notes are capped at 300 characters on a word boundary", () => {
  const long = Array.from({length: 80}, (_, i) => "word" + i).join(" ");
  const [n] = entryNotes([entry("PET-1", "09:00", "10:00")], {blocks: [block("PET-1", "09:00", "10:00", long)]});
  assert.ok(n.length <= 300 && n.length > 280, n.length);
  assert.ok(long.startsWith(n) && long[n.length] === " ");
  const [w] = entryNotes([entry("PET-1", "09:00", "10:00", true)], {spans: [span("PET-1", "c", long, "09:00", "10:00")]});
  assert.ok(w.length <= 300 && w.startsWith("Waiting on agent run: word0"));
  assert.equal(capWords("short"), "short");
});
