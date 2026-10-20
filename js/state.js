// The board's shared mutable runtime state. DOM modules read and write it; render modules only read it.
import {loadSkin, loadLayout, loadShown, loadShowDone, loadFold, loadCardFold, loadBarColor, loadDoneWhen} from "./prefs.js";

/** Shared runtime state; per-viewer values start from prefs. */
export const state = {
  db: null, sessions: [],
  views: new Map(), // session id -> {el, summary, ctl, fold, tiles, cards, stop, sortable}
  viewSeq: 0,
  stackSortable: null, sessFocus: null,
  editing: false, busy: false, pending: false, cols: 1, refocus: null, chipFocus: null, undoLayout: null, toastTimer: 0,
  subOpen: new Map(), // "<session id>|<event index>" -> bool (events are append-only, so the index is stable)
  skin: loadSkin(),
  layout: loadLayout(),
  shown: loadShown(),
  showDone: loadShowDone(),
  doneWhen: loadDoneWhen(),
  fold: loadFold(),
  cardFold: loadCardFold(),
  barColor: loadBarColor()
};
