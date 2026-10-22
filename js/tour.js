// The new-viewer tour's copy and its pure rules. Edit a step's title or text here; the controller is js/tour-ui.js.
/** Tour steps in order: the control each points at (a CSS selector), a title and one or two sentences. */
export const STEPS = [
  {sel: "#chip-slot .chips", title: "Session chips", text: "Each chip is a session touched on the selected day. Click one to show it, or Shift-click to stack several."},
  {sel: ".day-nav", title: "The day", text: "Pick the day to show with the arrows, the date or Today. The Board and the Time page share it."},
  {sel: "[data-search-toggle]", title: "Session search", text: "Click the magnifier (or press /) to find any session on any day, by title, ticket, branch or card."},
  {sel: ".sess .shead", title: "A session", text: "The header shows the ticket, branch, progress and what is happening now. The ▾ button minimizes the session."},
  {sel: ".sess .slot.log", title: "Activity log", text: "What happened in this session, newest first. Each dispatch's agent progress is nested under it."},
  {sel: ".sess .slot:not(.log)", title: "A ticket card", text: "Its stages, live timer and agent progress lines. The ✎ edits this card's size and place."},
  {sel: ".sess .hide-done", title: "Hide done", text: "Hides this session's finished cards, so only open work is left."},
  {sel: '[data-go="time"]', title: "Time", text: "This tab beside the name opens time worked per ticket by day, week or month. Work Detail entries copy on click, with the Marker and Scrum there too."},
  {sel: "#settings-menu > summary", title: "Settings", text: "Theme and colors for every page, then this page's own settings. Take the tour again from here."}
];

/** The steps whose target is on the page, given the selectors that are present. */
export const stepsToShow = (steps, present) => steps.filter(s => present.includes(s.sel));

/** Popover position {left, top}: below the target, else above, kept inside the viewport with a margin. */
export function placePop(r, w, h, vw, vh, gap = 10, m = 8){
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const top = r.bottom + gap + h <= vh - m ? r.bottom + gap : r.top - gap - h >= m ? r.top - gap - h : vh - h - m;
  return {left: clamp(r.left, m, vw - w - m), top: clamp(top, m, Math.max(m, vh - h - m))};
}
