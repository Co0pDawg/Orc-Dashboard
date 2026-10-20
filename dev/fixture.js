// Preview fixture: a stub window.claude db plus the v14 preview data and prefs (see README "Preview"). Loaded as a classic script before the page.
const now = Date.now(), iso = m => new Date(now - m*60000).toISOString();
const st = (...s) => s.map(([label, state, m]) => ({label, state, ...(m ? {started: iso(m)} : {})}));
const S = {
 sessions: [
  {id:"2026-10-19-petsoft-search", title:"Header search card results", ticket:"17983", branch:"feature/17983-rework-the-top-search-bar-card-results", status:"building", started:iso(90), updated:iso(2), now:"Builder on Task 18001: employee and class results",
   events:[{at:iso(80),text:"Spec written for 3 tasks"},{at:iso(60),text:"Builder dispatched on Task 18000",sub:[{at:iso(55),text:"Spec read, 6 files in scope"},{at:iso(48),text:"Build green"},{at:iso(40),text:"Filtered tests 18/22 pass"},{at:iso(35),text:"All 22 filtered tests pass"}]},{at:iso(30),text:"Refuter ACCEPT on Task 18000"},{at:iso(50),text:"Committed 581a23a31"},{at:iso(72),text:"Builder dispatched on Task 18001",card:"c2"}]},
  {id:"2026-10-19-petsoft-dashboard", title:"Dashboard times", ticket:"17979", branch:"feature/17979-dashboard-times", status:"Done", completed:iso(15), pr:{id:6238, url:"https://dev.azure.com/Cosairus/Petsoft/_git/Petsoft/pullrequest/6238", status:"draft"}, started:iso(300), updated:iso(20), now:"Pre-PR review, light tier",
   events:[{at:iso(200),text:"Refuter REWORK: missing AM/PM on tooltip"},{at:iso(100),text:"Builder pushed fix"}]},
  // Absolute dates for the Time page: its dispatches make the agent spans on Oct 14 and Oct 19.
  {id:"2026-10-14-petsoft-peer-review", title:"Peer review: fee rounding", ticket:"18004", branch:"review/6250-fix", status:"Done", completed:"2026-10-19T15:00:00-04:00", started:"2026-10-14T09:30:00-04:00", updated:"2026-10-19T15:00:00-04:00", now:"Fixes pushed",
   events:[{at:"2026-10-14T09:40:00-04:00",text:"Builder dispatched on #18004 tests",card:"c7"},{at:"2026-10-14T11:05:00-04:00",text:"Refuter ACCEPT on #18004 tests",card:"c7"},
     {at:"2026-10-19T13:10:00-04:00",text:"Builder dispatched on #18004 fixes",card:"c6"},{at:"2026-10-19T14:50:00-04:00",text:"Refuter ACCEPT on #18004 fixes",card:"c6"},{at:"2026-10-19T15:00:00-04:00",text:"Committed 4be1c2a90"}]}
 ],
 cards: [
  {id:"c1", session:"2026-10-19-petsoft-search", order:1, ticket:"17983", task:"18000", kind:"Task", title:"Customer results as cards", agent:"builder (opus)", tokens:"182k", commit:"5a7f13d4b", stages:st(["Spec","done"],["Build","done"],["Refute","done"],["Commit","done"]), updated:iso(30)},
  {id:"c2", session:"2026-10-19-petsoft-search", order:2, ticket:"17983", task:"18001", kind:"Task", title:"Reservations, invoices, employees and classes", agent:"builder (opus)", stages:st(["Spec","done"],["Build","active",72],["Refute","pending"],["Commit","pending"]), note:"Running filtered tests", updated:iso(2), progress:[{at:iso(70),text:"spec read, 7 files in scope"},{at:iso(41),text:"build green"},{at:iso(22),text:"filtered tests 31/40 pass"},{at:iso(6),text:"mutation check: InvoiceSearch tenant guard caught"}]},
  {id:"c3", session:"2026-10-19-petsoft-dashboard", order:1, ticket:"17979", task:"17980", kind:"Task", title:"Show dashboard times in facility time zone", stages:st(["Spec","done"],["Build","done"],["Refute","rework"],["Commit","pending"]), note:"REWORK: tooltip shows 24-hour time", updated:iso(20)}
  ,{id:"c4", session:"2026-10-19-petsoft-search", order:3, ticket:"17983", task:"18002", kind:"Task", title:"Docs map update", stages:st(["Spec","done"],["Build","pending"]), updated:iso(5)}
  ,{id:"c5", session:"2026-10-19-petsoft-search", order:4, ticket:"17983", task:"18003", kind:"Bug", title:"Phone search misses extensions", stages:{spec:"done", build:"active", refute:"pending"}, updated:iso(4)}
  ,{id:"c6", session:"2026-10-14-petsoft-peer-review", order:2, ticket:"18004", kind:"Task", title:"Fee rounding fixes", stages:st(["Build","done"],["Refute","done"]), updated:"2026-10-19T14:50:00-04:00", progress:[{at:"2026-10-19T13:25:00-04:00",text:"spec read, 3 files in scope"},{at:"2026-10-19T14:05:00-04:00",text:"filtered tests 12/12 pass"}]}
  ,{id:"c7", session:"2026-10-14-petsoft-peer-review", order:1, ticket:"18004", kind:"Task", title:"Fee rounding tests", stages:st(["Build","done"],["Refute","done"]), updated:"2026-10-14T11:05:00-04:00"}
 ]};
// timeline/<date> docs as the sync writes them (EDT all October). Oct 19 mirrors the real day: three PET tickets across
// parallel sessions, an UNKNOWN stretch, a turn with no stop (16:30), an evening turn (UTC next day) and a 23:54 fragment.
{ const at = (d, hm) => `${d}T${hm}:00-04:00`;
  const turns = (d, list) => list.flatMap(([s, t, a, b]) => [{at:at(d,a), kind:"prompt", session:s, ticket:t}, {at:at(d,b), kind:"stop", session:s, ticket:t}]);
  const day = (d, events, extra = {}) => ({id:d, date:d, synced:at(d,"23:59"), tz:"-04:00", events, sessions:{a:{project:"Petsoft"}, b:{project:"Petsoft"}, c:{project:"Petsoft", review:true}}, notes:{}, flags:{}, ...extra});
  const T = [["a","PET-17896","09:10","10:05"],["b","PET-17901","10:20","11:40"],["a","PET-17896","13:00","14:30"]], U = [["b","PET-17979","08:40","10:10"],["a","PET-17983","10:30","12:00"],["c","PET-18004","13:30","15:10"],["a","PET-17983","15:30","16:20"]];
  const d19 = "2026-10-19", e19 = [["08:05","prompt","sA","PET-17983"],["08:20","tool","sA","PET-17983"],["08:40","stop","sA","PET-17983"],["08:50","prompt","sB","PET-17979*"],["09:30","stop","sB","PET-17979"],
    ["09:35","prompt","sA","17983"],["10:10","agent","sA","PET-17983"],["10:20","stop","sA","17983"],["10:35","prompt","sD","UNKNOWN"],["10:52","stop","sD","UNKNOWN"],
    ["11:10","prompt","sB","PET-17979"],["11:40","notify","sB","PET-17979"],["11:58","stop","sB","PET-17979"],["13:00","prompt","sC","PET-18004"],["13:50","stop","sC","PET-18004"],
    ["14:05","prompt","sB","PET-17979"],["14:12","agent","sB","PET-17979"],["14:45","stop","sB","PET-17979"],["16:30","prompt","sA","PET-17983"],["16:50","tool","sA","PET-17983"],
    ["20:30","prompt","sE","PET-17983"],["21:05","stop","sE","PET-17983"],["23:54","prompt","sD","-"],["23:55","stop","sD","-"]].map(([hm, kind, session, ticket]) => ({at:at(d19,hm), kind, session, ticket}));
  S.timeline = [
    ...["2026-10-01","2026-10-02","2026-10-06","2026-10-08","2026-10-12","2026-10-13","2026-10-15"].map((d, i) => day(d, turns(d, i % 2 ? U : T))),
    day("2026-10-14", turns("2026-10-14", [["c","PET-18004","09:00","09:35"],["b","PET-17979","09:45","11:30"],["a","PET-17983","13:10","15:40"]])),
    day("2026-10-16", turns("2026-10-16", [["a","PET-17983","09:30","11:15"]])),
    day(d19, e19, {sessions:{sA:{project:"Petsoft"}, sB:{project:"Petsoft"}, sC:{project:"Petsoft", review:true}, sD:{project:"orchestration"}, sE:{project:"Petsoft"}},
      notes:{"PET-17983":"Header search: customer results as cards", "PET-17979":"Dashboard times in the facility time zone", "PET-18004":"Peer review: fee rounding fixes"},
      flags:{"PET-17979":{unplanned:true}}})];
}
const ops = {"==":(a,b)=>a===b, ">=":(a,b)=>a>=b, "<=":(a,b)=>a<=b};
const q = name => ({ w:[], orderBy(){return this;}, where(f,o,v){return {...this, w:[...this.w,[f,o,v]]};},
  onSnapshot(cb){ const r=(S[name]||[]).filter(x=>this.w.every(([f,o,v])=>ops[o](x[f],v))); setTimeout(()=>cb({docs:r.map(x=>({id:x.id,data:()=>x}))}),50); return ()=>{}; }});
window.claude = {use: async n => n==="db" ? {collection: q} : null};
// Hash flags (dev only): "leet" picks the 1337 skin, "stack" shows both sessions, "edit" opens Customize layout.
// The page itself reads "time", "time-week" or "time-month" plus an optional date, e.g. #leet-time-week-2026-10-14.
if (location.hash.includes("stack")) localStorage.setItem("board.shown", JSON.stringify(S.sessions.map(s => s.id))); else localStorage.removeItem("board.shown");
localStorage.setItem("board.skin", location.hash.includes("leet") ? "leet" : "sleek");
localStorage.setItem("board.layout", JSON.stringify({order:[], size:{}}));
localStorage.setItem("board.cardFold", JSON.stringify({c1:true, c4:true}));
localStorage.setItem("board.folded", JSON.stringify([]));
localStorage.setItem("board.barColor","#4fc3f7"); // custom, not the #79e36a default
{ const m = location.hash.match(/pal-([a-z]+)/); if (m) { localStorage.setItem("board.palette", m[1]); localStorage.removeItem("board.barColor"); } else localStorage.removeItem("board.palette"); }
localStorage.setItem("board.showDone","1");
if (location.hash.includes("prmode")) localStorage.setItem("board.doneWhen", "pr"); else localStorage.removeItem("board.doneWhen");
