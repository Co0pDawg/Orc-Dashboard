// Pure: the Note for each Work Detail entry, from the day's roll-up blocks and agent runs. No DOM, no storage.
import {normTicket} from "./segments.js";

const ms = t => Date.parse(t);

/** s cut to at most max characters on a word boundary, with no trailing "; ". */
export function capWords(s, max = 300){
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1), i = head.lastIndexOf(" ");
  return (i > 0 ? head.slice(0, i) : s.slice(0, max)).replace(/[;,\s]+$/, "");
}

/** Texts joined with "; " without ".;": each loses one trailing ".", and the note ends in "." when the last text did. */
const joinTexts = texts => {
  const parts = [...new Set(texts.map(s => s.trim().replace(/\.$/, "")))];
  return parts.join("; ") + (texts[texts.length - 1].trim().endsWith(".") ? "." : "");
};

/**
 * One Note per entry. A driven or mixed entry joins the texts of the same-ticket roll-up blocks it overlaps, in time order;
 * overlapping none, it takes the nearest same-ticket block (the earlier one on a tie). A waiting-only entry names the agent
 * runs on its ticket that overlap it (card title, else dispatch text) and falls back to the blocks rule. Either way the
 * last fallback is notes[ticket], else "". Notes are capped at 300 characters.
 */
export function entryNotes(entries, {blocks, notes, spans, cards} = {}){
  return (entries || []).map(e => {
    const t = normTicket(e.ticket), a = ms(e.start), b = ms(e.end);
    const mine = list => (list || []).filter(x => normTicket(x.ticket) === t).sort((x, y) => ms(x.start) - ms(y.start));
    const overlaps = x => Math.min(b, ms(x.end)) - Math.max(a, ms(x.start)) > 0;
    if (e.waiting){
      const runs = [...new Set(mine(spans).filter(overlaps).map(s => ((cards || []).find(c => c._id === s.card) || {}).title || s.agent).filter(Boolean))];
      if (runs.length) return capWords(`Waiting on agent run${runs.length > 1 ? "s" : ""}: ${runs.join("; ")}`);
    }
    const same = mine(blocks).filter(x => x.text), hit = same.filter(overlaps);
    // The ticket's nearest block describes this stretch better than the day's first roll-up row (notes[ticket]).
    const gap = x => Math.max(ms(x.start) - b, a - ms(x.end));
    const near = same.reduce((best, x) => !best || gap(x) < gap(best) ? x : best, null);
    if (hit.length || near) return capWords(joinTexts((hit.length ? hit : [near]).map(x => x.text)));
    return (t && notes && notes[t]) || "";
  });
}
