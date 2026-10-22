// Pure helpers: no DOM, no storage.

/** Default Azure DevOps "org/project" when a session names none. */
export const ADO_DEFAULT = "Cosairus/Petsoft";
// A session's optional `ado` ("org/project", e.g. "Cosairus/Cosairus Payment Services" for Rise) picks the project
// its ticket links open in; anything not shaped org/project falls back to the default.
/** Work item URL in Azure DevOps; the only place a link URL is built. */
export const adoUrl = (id, project) => {
  const p = typeof project === "string" && /^[^/]+\/[^/]+$/.test(project.trim()) ? project.trim() : ADO_DEFAULT;
  return "https://dev.azure.com/" + p.split("/").map(encodeURIComponent).join("/") + "/_workitems/edit/" + encodeURIComponent(id);
};
/** HTML-escapes any value (null/undefined become ""). */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/** Short date and 12-hour time, or "" for a missing or bad date. */
export const fmt = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return d.toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true}); };
/** 12-hour time only, or "" for a bad date. */
export const t12 = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit", hour12:true}); };
/** Clamps n into [lo, hi]. */
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** Elapsed time since iso as "Nm", "Nh Nm" or "Nd Nh". */
/** Countdown to a future time: "starts 3:28 PM · in 1h 5m", or "starting now" once it has passed. */
export function untilText(iso, now = Date.now()){
  const t = new Date(iso); if (isNaN(t)) return "";
  const m = Math.ceil((t - now) / 60000), at = t.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  if (m <= 0) return `starting now (${at})`;
  return `starts ${at} · in ${m < 60 ? m + "m" : Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "")}`;
}
export function ago(iso){
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor(m % 1440 / 60)}h`;
}
// Board is "#board" on today and "#board-yyyy-MM-dd" on another day; Time's tokens carry the same suffix.
// A date must round-trip: Date rolls 2026-02-30 over to Mar 2 instead of refusing it.
/** The yyyy-MM-dd a hash names, or "" when it names none or an impossible date. */
export const hashDay = h => {
  const d = /\d{4}-\d{2}-\d{2}/.exec(h || "")?.[0] || "", t = new Date(d + "T00:00:00");
  return d && t.getFullYear() === +d.slice(0, 4) && t.getMonth() + 1 === +d.slice(5, 7) && t.getDate() === +d.slice(8) ? d : "";
};
/** The hash for a page ("board" or "time") on day: the plain page on today, else the page plus "-yyyy-MM-dd". */
export const pageHash = (page, day, today) => !day || day === today ? page : `${page}-${day}`;
/** A yyyy-MM-dd day as "Mon, Oct 20". */
export const fmtDay = day => new Date(day + "T00:00:00").toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"});
