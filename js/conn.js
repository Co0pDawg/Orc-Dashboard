// Connection state for the top-bar notice. Pure: the page wires it to the db error callbacks and the DOM.

/** "Cannot reach the board server", or with a last good load: "Board server not reachable; showing data from <time>". */
export const connText = (lastOk, t12) => lastOk ? `Board server not reachable; showing data from ${t12(lastOk)}` : "Cannot reach the board server";

/** A tracker per source key: fail(key) marks it down, ok(key) good, drop(key) forgets it; onChange(down, lastOk) runs only
 * when the overall state flips (down while any source is down). */
export function createConn(onChange, now = () => new Date().toISOString()){
  const bad = new Set();
  let lastOk = null;
  const settle = had => { if (had && !bad.size) onChange(false, lastOk); };
  return {
    ok(key){ lastOk = now(); const had = bad.size > 0; bad.delete(key); settle(had); },
    fail(key){ if (!bad.size){ bad.add(key); onChange(true, lastOk); } else bad.add(key); },
    drop(key){ const had = bad.size > 0; bad.delete(key); settle(had); },
    get down(){ return bad.size > 0; },
  };
}

/** Shows or hides the notice element (anything with textContent and hidden) for the overall state. */
export function showNotice(el, down, text){
  el.textContent = down ? text : "";
  el.hidden = !down;
}
