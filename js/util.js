// Pure helpers: no DOM, no storage.

/** Work item URL in Azure DevOps; the only place a link URL is built. */
export const adoUrl = id => "https://dev.azure.com/Cosairus/Petsoft/_workitems/edit/" + id;
/** HTML-escapes any value (null/undefined become ""). */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/** Short date and 12-hour time, or "" for a missing or bad date. */
export const fmt = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return d.toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true}); };
/** 12-hour time only, or "" for a bad date. */
export const t12 = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit", hour12:true}); };
/** Clamps n into [lo, hi]. */
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** Elapsed time since iso as "Nm", "Nh Nm" or "Nd Nh". */
export function ago(iso){
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor(m % 1440 / 60)}h`;
}
