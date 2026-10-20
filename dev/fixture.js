// Preview fixture: a stub window.claude db plus the v14 preview data and prefs (see README "Preview"). Loaded as a classic script before the page.
const now = Date.now(), iso = m => new Date(now - m*60000).toISOString();
const st = (...s) => s.map(([label, state, m]) => ({label, state, ...(m ? {started: iso(m)} : {})}));
const S = {
 sessions: [
  {id:"2026-10-19-petsoft-search", title:"Header search card results", ticket:"17983", branch:"feature/17983-rework-the-top-search-bar-card-results", status:"building", started:iso(90), updated:iso(2), now:"Builder on Task 18001: employee and class results",
   events:[{at:iso(80),text:"Spec written for 3 tasks"},{at:iso(60),text:"Builder dispatched on Task 18000",sub:[{at:iso(55),text:"Spec read, 6 files in scope"},{at:iso(48),text:"Build green"},{at:iso(40),text:"Filtered tests 18/22 pass"},{at:iso(35),text:"All 22 filtered tests pass"}]},{at:iso(30),text:"Refuter ACCEPT on Task 18000"},{at:iso(50),text:"Committed 581a23a31"},{at:iso(72),text:"Builder dispatched on Task 18001",card:"c2"}]},
  {id:"2026-10-19-petsoft-dashboard", title:"Dashboard times", ticket:"17979", branch:"feature/17979-dashboard-times", status:"Done", completed:iso(15), started:iso(300), updated:iso(20), now:"Pre-PR review, light tier",
   events:[{at:iso(200),text:"Refuter REWORK: missing AM/PM on tooltip"},{at:iso(100),text:"Builder pushed fix"}]}
 ],
 cards: [
  {id:"c1", session:"2026-10-19-petsoft-search", order:1, ticket:"17983", task:"18000", kind:"Task", title:"Customer results as cards", agent:"builder (opus)", tokens:"182k", commit:"5a7f13d4b", stages:st(["Spec","done"],["Build","done"],["Refute","done"],["Commit","done"]), updated:iso(30)},
  {id:"c2", session:"2026-10-19-petsoft-search", order:2, ticket:"17983", task:"18001", kind:"Task", title:"Reservations, invoices, employees and classes", agent:"builder (opus)", stages:st(["Spec","done"],["Build","active",72],["Refute","pending"],["Commit","pending"]), note:"Running filtered tests", updated:iso(2), progress:[{at:iso(70),text:"spec read, 7 files in scope"},{at:iso(41),text:"build green"},{at:iso(22),text:"filtered tests 31/40 pass"},{at:iso(6),text:"mutation check: InvoiceSearch tenant guard caught"}]},
  {id:"c3", session:"2026-10-19-petsoft-dashboard", order:1, ticket:"17979", task:"17980", kind:"Task", title:"Show dashboard times in facility time zone", stages:st(["Spec","done"],["Build","done"],["Refute","rework"],["Commit","pending"]), note:"REWORK: tooltip shows 24-hour time", updated:iso(20)}
  ,{id:"c4", session:"2026-10-19-petsoft-search", order:3, ticket:"17983", task:"18002", kind:"Task", title:"Docs map update", stages:st(["Spec","done"],["Build","pending"]), updated:iso(5)}
  ,{id:"c5", session:"2026-10-19-petsoft-search", order:4, ticket:"17983", task:"18003", kind:"Bug", title:"Phone search misses extensions", stages:{spec:"done", build:"active", refute:"pending"}, updated:iso(4)}
 ]};
const q = name => ({ w:null, orderBy(){return this;}, where(f,o,v){this.w=[f,v];return this;},
  onSnapshot(cb){ let r=S[name]; if(this.w) r=r.filter(x=>x[this.w[0]]===this.w[1]); setTimeout(()=>cb({docs:r.map(x=>({id:x.id,data:()=>x}))}),50); return ()=>{}; }});
window.claude = {use: async n => n==="db" ? {collection: q} : null};
localStorage.removeItem("board.shown");
localStorage.setItem("board.skin", location.hash==="#leet" ? "leet" : "sleek");
localStorage.setItem("board.layout", JSON.stringify({order:[], size:{}}));
localStorage.setItem("board.cardFold", JSON.stringify({c1:true, c4:true}));
localStorage.setItem("board.folded", JSON.stringify([]));
localStorage.setItem("board.barColor","#4fc3f7"); // custom, not the #79e36a default
localStorage.setItem("board.showDone","1");
