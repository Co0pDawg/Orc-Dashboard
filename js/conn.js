// Connection state for the top-bar notice. Pure: the page wires it to the db error callbacks and the DOM.

/** "Cannot reach the board server", or with a last good load: "Board server not reachable; showing data from <time>". */
export const connText = (lastOk, t12) => lastOk ? `Board server not reachable; showing data from ${t12(lastOk)}` : "Cannot reach the board server";

/** A tracker: ok() after a good snapshot, fail() after an error; onChange(down, lastOk) runs only when the state flips. */
export function createConn(onChange, now = () => new Date().toISOString()){
  let down = false, lastOk = null;
  return {
    ok(){ lastOk = now(); if (down){ down = false; onChange(false, lastOk); } },
    fail(){ if (!down){ down = true; onChange(true, lastOk); } },
    get down(){ return down; },
  };
}
