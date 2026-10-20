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

// When a session counts as finished: "fable" (Fable marks it Done) or "pr" (its pull request is completed).
/** The finished-session rule. */
export const loadDoneWhen = () => store.get("board.doneWhen") === "pr" ? "pr" : "fable";
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
