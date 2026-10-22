// The board's shared mutable runtime state. DOM modules read and write it; render modules only read it.
import {loadSkin, loadLayout, loadShown, loadShowDone, loadFold, loadCardFold, loadDoneWhen, loadThemes, loadRounding, loadEntryLine, loadLogFull, loadHideDone, loadEntriesFold} from "./prefs.js";

/** Shared runtime state; per-viewer values start from prefs. */
export const state = {
  db: null, sessions: [], cards: [], // cards: every card, for the day filter and the Time page
  // The selected local day (yyyy-MM-dd), shared by the Board and Time; set by route(), never stored.
  // dayPicked is false while it follows today, which rolls it over at midnight.
  day: "", dayPicked: false,
  // A session opened from search stays on the chips for its day even when finished and Show finished is off.
  opened: null, // {id, day} while pinned
  views: new Map(), // session id -> {el, summary, ctl, fold, tiles, cards, stop, sortable}
  viewSeq: 0,
  stackSortable: null, sessFocus: null,
  // Edit mode is per pane: editing holds the pane ids (card ids and "log:<sid>") whose ✎ is on, editSess the session ids.
  editing: new Set(), editSess: new Set(), busy: false, pending: false, cols: 1, refocus: null, chipFocus: null, undoLayout: null, toastTimer: 0,
  subOpen: new Map(), // "<session id>|<event index>" -> bool (events are append-only, so the index is stable)
  skin: loadSkin(),
  layout: loadLayout(),
  shown: loadShown(),
  showDone: loadShowDone(),
  doneWhen: loadDoneWhen(),
  fold: loadFold(),
  cardFold: loadCardFold(),
  rounding: loadRounding(),
  entryLine: loadEntryLine(),
  entriesFold: loadEntriesFold(),
  logFull: loadLogFull(),
  hideDone: loadHideDone(),
  ...loadThemes() // theme: the selected id; themes: the custom ones
};
