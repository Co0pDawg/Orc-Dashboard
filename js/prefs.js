// Every per-viewer preference, and the only module that touches localStorage. Storage can throw or come back
// empty (private windows, blocked site data), so every access is wrapped and the board works without it.
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};

/** "leet" or "sleek". */
export const loadSkin = () => store.get("board.skin") === "leet" ? "leet" : "sleek";
/** Saves the skin. */
export const saveSkin = skin => store.set("board.skin", skin);

// Layout is a per-viewer convenience: {order:[pane ids], size:{id:{w,r}}}; w in columns, r in grid rows (absent = 1).
/** The saved pane layout, or an empty one. */
export const loadLayout = () => { try { const l = JSON.parse(store.get("board.layout")); if (l && Array.isArray(l.order) && l.size) return l; } catch {} return {order: [], size: {}}; };
/** Saves the pane layout. */
export const saveLayout = layout => store.set("board.layout", JSON.stringify(layout));

// Shown sessions, top to bottom; v5 kept a single board.session.
/** Session ids the viewer chose to show. */
export const loadShown = () => { try { const s = JSON.parse(store.get("board.shown")); if (Array.isArray(s)) return s.filter(x => typeof x === "string"); } catch {} const one = store.get("board.session"); return one ? [one] : []; };
/** Saves the shown session ids. */
export const saveShown = shown => store.set("board.shown", JSON.stringify(shown));

/** Whether finished sessions are shown. */
export const loadShowDone = () => store.get("board.showDone") === "1";
/** Saves the show-finished toggle. */
export const saveShowDone = on => store.set("board.showDone", on ? "1" : "0");

// Per-session fold choice {id: true|false}; a session with no choice folds when finished. v7 kept an array of folded ids.
/** Per-session fold choices. */
export const loadFold = () => {
  try { const f = JSON.parse(store.get("board.fold")); if (f && typeof f === "object" && !Array.isArray(f)) return f; } catch {}
  try { const old = JSON.parse(store.get("board.folded")); if (Array.isArray(old)) return Object.fromEntries(old.map(id => [id, true])); } catch {}
  return {};
};
/** Saves the fold choices. */
export const saveFold = fold => store.set("board.fold", JSON.stringify(fold));

// Minimized ticket cards {card id: true}; a card with no entry is expanded.
/** Per-card minimize choices. */
export const loadCardFold = () => { try { const f = JSON.parse(store.get("board.cardFold")); if (f && typeof f === "object" && !Array.isArray(f)) return f; } catch {} return {}; };
/** Saves the per-card minimize choices. */
export const saveCardFold = fold => store.set("board.cardFold", JSON.stringify(fold));

// When a session counts as finished: "orchestrator" (the orchestrator marks it Done) or "pr" (its pull request is completed);
// anything else, including the older "fable", reads as the default.
/** The finished-session rule. */
export const loadDoneWhen = () => store.get("board.doneWhen") === "pr" ? "pr" : "orchestrator";
/** Saves the finished-session rule. */
export const saveDoneWhen = v => store.set("board.doneWhen", v);

// 1337 status bar border color, picked by the viewer; it also outlines and tints the active tab.
/** The viewer's own status bar color, or null to follow the color scheme. */
export const loadBarColor = () => /^#[0-9a-f]{6}$/i.test(store.get("board.barColor") || "") ? store.get("board.barColor") : null;
/** Saves the status bar color; null goes back to following the color scheme. */
export const saveBarColor = c => c ? store.set("board.barColor", c) : store.del("board.barColor");

// The color scheme (an id from js/palettes.js), or "" for the board's own colors.
/** The saved color scheme id. */
export const loadPalette = () => store.get("board.palette") || "";
/** Saves the color scheme id. */
export const savePalette = id => id ? store.set("board.palette", id) : store.del("board.palette");

// Entry rounding in minutes (1 = Exact); it changes the Time page's entries only, never the drawn times.
/** The entry rounding unit: 1, 5, 10, 15 or 30 minutes (default 15). */
export const loadRounding = () => { const n = Number(store.get("board.rounding")); return [1, 5, 10, 15, 30].includes(n) ? n : 15; };
/** Saves the entry rounding unit. */
export const saveRounding = n => store.set("board.rounding", String(n));

// The entry marker: a line on the Day calendar at the entry centered in the Entries list (default on).
/** Whether the entry marker shows. */
export const loadEntryLine = () => store.get("board.entryLine") !== "0";
/** Saves the entry marker toggle. */
export const saveEntryLine = on => store.set("board.entryLine", on ? "1" : "0");

// The activity log stretches to every row its session's cards use (default on).
/** Whether the activity log fills its column. */
export const loadLogFull = () => store.get("board.logFull") !== "0";
/** Saves the full-column log toggle. */
export const saveLogFull = on => store.set("board.logFull", on ? "1" : "0");

// Sessions whose finished cards are hidden {session id: true}.
/** Per-session hide-finished-cards choices. */
export const loadHideDone = () => { try { const f = JSON.parse(store.get("board.hideDone")); if (f && typeof f === "object" && !Array.isArray(f)) return f; } catch {} return {}; };
/** Saves the per-session hide-finished-cards choices. */
export const saveHideDone = f => store.set("board.hideDone", JSON.stringify(f));

// The Day view's Entries pane folded to a side strip (default open).
/** Whether the Entries pane is folded. */
export const loadEntriesFold = () => store.get("board.entriesFold") === "1";
/** Saves the Entries fold. */
export const saveEntriesFold = on => store.set("board.entriesFold", on ? "1" : "0");

// The guided tour has been finished, skipped or closed once; it then starts only from Settings or the ? button.
/** Whether the viewer has seen the tour. */
export const loadToured = () => store.get("board.toured") === "1";
/** Marks the tour as seen. */
export const saveToured = () => store.set("board.toured", "1");
