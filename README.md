# Orc-istrator

The orchestration board (the name keeps the repo family's spelling: Orc-istration for the setup, Orc-istrator for the board).

A private claude.ai Artifact (your own, published from this repo; its URL lives in `~/.claude/board.local.md`; `db` capability) that shows orchestration sessions live: one block per session with an activity log pane and one pane per ticket card moving through its stages. Two skins: Sleek (light and dark cards) and 1337 (a terminal screen). The page only reads the db; the orchestrator and its agents write it through ArtifactData. Code rules are in [STANDARDS.md](STANDARDS.md).

## Files

| Path | Role |
|---|---|
| `orchestration-board.html` | Page shell: title, fonts, the four stylesheets, static markup, Sortable, `js/main.js` |
| `css/tokens.css` | Color and font tokens (light, dark, 1337) and the body base |
| `css/base.css` | Skin-neutral layout and controls |
| `css/sleek.css`, `css/leet.css` | Every rule of one skin, prefixed `.sleek` / `.leet` |
| `js/util.js` | Pure helpers: `esc`, `fmt`, `t12`, `clamp`, `ago`, `adoUrl` (per-session ADO project), the day in a page hash (`hashDay`, `pageHash`, `fmtDay`) |
| `js/model.js` | Pure data logic: card state, stage timing, sub-event windows, which sessions were touched on a day, visible/live sessions |
| `js/prefs.js` | Every localStorage read and write |
| `js/state.js` | The shared runtime state object |
| `js/render/shared.js`, `sleek.js`, `leet.js` | HTML strings for panes, logs and headers |
| `js/board.js` | Session views, tiles, `render()`, timers, column fitting, Sortable per view |
| `js/chooser.js` | The two-row top bar: row 1 is the name, the Board / Time tabs, clock, gear and `?`; row 2 (day control, search, session chips, Show finished) shows only on pages that opt in (today only Board; `css/base.css`) |
| `js/search.js` | Pure session search: matching, ranking and each session's last-touched time |
| `js/layout-edit.js` | Per-pane edit mode (the ✎ on each pane): move/resize, corner drag, grip keys, Esc; session reorder; Settings > Layout resets and the undo toast |
| `css/palettes.css`, `js/palettes.js` | GENERATED color schemes (`npm run palettes` from `dev/palettes.json`); never edit by hand |
| `js/time/segments.js`, `entries.js`, `notes.js`, `scrum.js` | Time page pure logic: driving segments and agent spans, Work Detail entries with rounding, each entry's Note, the scrum summary |
| `js/time/render.js`, `controller.js` | Time page HTML strings (Day, Week, Month, entries, scrum dialog) and its controller (timeline subscription, date navigation, copy) |
| `js/settings.js` | The Settings gear: General (the skin switch and Customize colors) on every page, then the current page's own section: Board (Activity log fills its column, Layout reset, when a session counts as finished) or Time (Entry rounding). The Layout reset row is bound in `layout-edit.js` |
| `js/theme.js`, `js/theme-ui.js` | Themes: the pure parts (token list, merge, hex/rgb, contrast, migration, editor rows) and the Customize colors editor |
| `js/partials/settings-menu.js` | The Settings menu markup (static). Imported first by `main.js`, so its controls exist before other modules look them up |
| `js/main.js` | The only entry: binds the controllers, applies the skin, subscribes to the db |
| `tests/search.test.js` | `node:test` suite for `search.js` |
| `tests/model.test.js`, `tests/day.test.js` | `node:test` suites for `model.js` and `util.js` (`day.test.js`: the day filter and the hash helpers) |
| `dev/` | Preview harness (`preview.html`, `preview.js`, `fixture.js`), static server, `check.js`; never published |

## Data contract (what the page reads)

- `sessions/<date>-<project>-<slug>`: `title, ticket, branch, status, started, updated, now, completed?, ado?, pr?, events[]`. `pr` is `{id, url, status}` with `status` one of `draft|active|completed|abandoned`; with the viewer's Settings rule "Its pull request is completed", a finished session whose PR is still draft or active stays unfinished on the board. `ado` is the Azure DevOps `"org/project"` that the session's ticket and task links open in. It defaults to `Cosairus/Petsoft`; set `"Cosairus/Cosairus Payment Services"` for Rise. Petsoft and CosairusAccountingModule use the default. Each event is `{at, text, sub?: [{at, text}], card?: "<card id>"}`. Events are append-only; the page keys expand/collapse state by event index. Sessions sort by `updated` descending. A session is finished when `completed` is set or `status` is Done/Complete/Completed/Finished (any case); finished sessions start minimized and stay off the chips until Show finished is on.
- The chips show only the sessions touched on the selected day (today by default): a session counts when its `started`, `updated`, `completed`, an event or sub-event `at`, or one of its cards' `updated`, `progress[].at` or `stages[].started` falls on that local day. On today finished sessions stay behind Show finished, whose count is today's finished sessions; on a past day they always show and Show finished hides. A day with nothing touched shows "Nothing touched on <day>". The day control (◀, date, ▶, Today) sits beside the chips.
- `cards/<id>`: `session, order, ticket, task, kind, title, agent, tokens, commit, note, updated, stages[], progress[]`. `stages` is an array of `{label, state, started?}` with `state` one of `done|active|rework|pending|skipped`, in plan order (the page also reads an object `{label: state}`, but write the array); `started` (ISO) is set when a stage turns active or rework, else the page falls back to the card's `updated`. `progress[]` is `{at, text}` lines posted by agents.
- A dispatch event that names `card` nests that card's `progress` from the event's time until the next dispatch for the same card. A running card shows its last three progress lines. The log shows "quiet Nm" since the newest event, sub-event or progress line, amber after 45 minutes.
- Times are ISO with offset.
- `timeline/<yyyy-MM-dd>` (written only by the worklog sync, never by the page): `{date, synced, tz, events:[{at, kind, session, ticket}], sessions:{<id>:{project, review}}, notes:{<ticket>:text}, titles:{<ticket>:ADO title}, blocks:[{start, end, ticket, text}], flags:{<ticket>:{unplanned:true}}}`. `ticket` is `PET-NNNNN` or null (no ticket); events carry no prompt text. `blocks` are the worklog roll-up's time blocks (model-written descriptions, ISO times with offset); an entry's Note joins the same-ticket blocks it overlaps, a waiting-only entry's Note names the agent runs it covers (card title, else dispatch text), and `notes[ticket]` is the fallback (js/time/notes.js entryNotes). `titles` labels the scrum's Yesterday lines (an older doc without it falls back to the board's session or card title). The Time page computes driving time from these events (a prompt drives its session through that turn's `stop` plus 15 minutes, cut short by a prompt in another session) and agent time from the board's own sessions and cards.

## Writing protocol (the orchestrator and its agents)

The single source for when the board is written. `~/.claude/CLAUDE.md` says to follow it, so keep it accurate.

Writes go through the ArtifactData tool (load it with ToolSearch `select:ArtifactData`) against the board URL. Writing more than one doc uses `batch`, and every write to an existing doc pins `if_version` to the version last read; on a conflict, re-get and redo. Take times from `date -Iseconds` so they carry an offset. Bump the session's `updated` on every write so it sorts first. Never republish the page for data.

| When | Write |
|---|---|
| **Start**: before the first dispatch of an orchestrated task | Create `sessions/<YYYY-MM-DD>-<project>-<slug>` (title, ticket, branch, status "Planning", started, updated, now, events: [the plan line], plus `ado` when the repo's work items are not in Cosairus/Petsoft) and one `cards/<id>` per ticket or task (session, order, ticket, task, kind, title, stages with every planned stage `pending`, updated). Use one batch. Card ids are short and unique, e.g. the task id. |
| **Dispatch** | The card's stage turns `active` with `started`; set `agent`. Append an event `{at, text: "<agent> dispatched on #<task>", card: "<card id>"}`. Update `now` and `status`. The brief carries `BOARD: <board URL> card <card id>` (marching orders item 10). |
| **Check-in** (the orchestrator reads a running agent's report file, test log or a late notice) | Append `{at, text}` to that dispatch event's `sub`, only if something changed. |
| **Heartbeat** (a dispatch expected to run past ~30 min) | Schedule a check every 20-30 min (Monitor on the agent's report or test-log file, or ScheduleWakeup/CronCreate). Each check posts a check-in. |
| **Report** | The stage turns `done` or `rework` (a rework stage gets a fresh `started`). Set `tokens` and `note`. Append the outcome as a top-level event that names the card, `{at, text, card}` ("refuter ACCEPT", "builder done: 40 tests pass"); the Time page ends that agent's span at this event. |
| **Commit** | Set the card's `commit`; append an event naming the hash. |
| **PR opened** | Set the session's `pr: {id, url, status: "draft"}` (url is the PR's Azure DevOps link). |
| **Finish**: the task's last write | Session `status: "Done"`, `completed`, a closing `now` ("Draft PR #### opened"), and a final event. Never delete session or card docs unless the user asks. |
| **Timeline upload**: at the Start of every orchestrated task, and when Cooper says "sync my timeline" | For each file in `~/.claude/timeline-sync/pending/` (`timeline-<date>.json`, built every 15 minutes by the worklog's scheduled sync), `get` `timeline/<date>`, then `set` it with `file_path` = that file, pinned to `if_version` when the doc exists, and delete the file after the write succeeds. See the worklog README, "Uploading". |
| **PR refresh**: at the Start of every orchestrated task | For each session with `completed` whose `pr.status` is not `completed` or `abandoned`, read the PR (Petsoft: `& ./.claude/scripts/ado.ps1 pr-get -Pr <id>`, cross-project for other repos) and write `pr.status`: `draft` while `isDraft`, else its `status`. One batch for all of them; skip when nothing changed. |

A card at Start, exactly in this shape (stages is an array in plan order, never an object):

```json
{"session": "2026-10-20-petsoft-18018-tab-strips", "order": 1, "ticket": "18018", "task": "18019", "kind": "Task",
 "title": "Tab restyle + Admin groups", "updated": "2026-10-20T12:02:46-04:00",
 "stages": [{"label": "Build", "state": "pending"}, {"label": "Refute", "state": "pending"}, {"label": "Commit", "state": "pending"}]}
```

Agents write only their own card's `progress[]` (rules in `~/.claude/agents/builder.md` and `refuter.md`), never the session doc, so they cannot collide with the orchestrator's writes. A subagent write needs no permission prompt (probed 2026-10-19).

Per-viewer state lives in localStorage: `board.skin`, `board.layout`, `board.shown` (older `board.session`), `board.fold` (older `board.folded`), `board.cardFold` (minimized cards), `board.showDone`, `board.doneWhen` (`orchestrator`, the default, which an older saved `fable` also reads as; or `pr`), `board.theme` (the selected theme: a palette id, "" for the board's own colors, or a custom theme's id), `board.themes` (custom themes `[{id, name, base, colors: {token: "#rrggbb"}}]`; the older `board.palette` and `board.barColor` are migrated into these once and removed, a saved bar color becoming the custom theme "My theme"), `board.rounding` (Time entries: 1, 5, 10, 15 or 30 minutes; default 15), `board.entryLine` (the Day entry marker; "0" turns it off), `board.logFull` (the activity log spans every row its cards use; default on; it grows a row at a time and stops above a card that can never sit beside it, such as a full-width one, so no row is left empty; in its edit mode the log then has no height controls), `board.hideDone` ({session id: true}, set by a session's Hide done button), `board.entriesFold` (the Day Entries pane folded to a side strip). The selected day is never stored: it lives in the hash and the page load.

## Layout editing

Each pane (every ticket card and each session's activity log) has a ✎ button (`[✎]` in 1337) on its header. It turns on edit mode for that pane only: the pane is outlined and shows its edit bar (grip, ◀ ▶ move, width and height steps, size reset) and a resize corner. Several panes can be in edit mode at once; Esc inside one, or its ✎ again, ends it. A pane that leaves the screen (Hide done, another day) leaves edit mode. With more than one session shown, each session header has its own ✎ that shows that session's ▲ ▼ mover and grip. Settings > Layout resets the order, the sizes or both for every pane, with Undo. The saved layout is still `board.layout` `{order, size}`.

## Session search

The magnifier on the top bar's second row, after the day control, (or `/`) opens a search field in a small popover that finds any session in the db, on any day, finished or not. It matches, ignoring case and punctuation, the session's title, ticket (`17983`, a partial `1798`, `PET-17983` or `#17983`), branch, id, and its cards' titles, tickets and tasks; every word must start a word in one of those. Event text is not searched (too noisy). Ticket hits and exact titles come first, then the newest last touch; at most 8 show. ↑ ↓ move, Enter or a click opens, Esc closes the list, then the popover (focus returns to the icon); Tab or a click elsewhere closes it too. Opening one moves the shared day to its last touch and shows it alone, even a finished one with Show finished off.

## Time page

`#time` (Day), `#time-week` and `#time-month`, each optionally followed by `-yyyy-MM-dd`, open the Time page; `#board` or no hash is the board on today, `#board-yyyy-MM-dd` the board on that day. The Board and Time share one selected day: a Time step, Today or date pick moves the Board's chips, the Board's day control moves Time, and switching pages keeps it. A viewer who never picked a day follows today, which rolls over at midnight; a picked day stays until Today. Day draws a column per ticket (Cooper's driving time solid, agent time hatched) beside the day's Work Detail entries, each value copies on click. Day and Week span the full day at 30-minute rows; the Entries list scrolls beside the calendar, and an entry marker (white in dark schemes and 1337, `--ink` in Sleek light; the Marker button beside Scrum, with a hover tip; on by default) shows on the calendar the time of the entry under a probe in the list. The probe runs from the list's top edge when scrolled to the top to its bottom edge when scrolled to the end, so the first and last entries are reachable. The Marker button hides where the line cannot show (narrow screens, or a list that does not scroll). Week stacks what ran per day; Month is a compact calendar. Every day has a Scrum button that opens a copyable Yesterday / Today / Blockers summary, kept high level (js/time/scrum.js): Yesterday is one line per driven ticket, most time first, as `PET-NNNNN <ADO title>: <up to 3 clauses>` from that ticket's roll-up blocks (else its note, never the ADO "<Type>: <title>" note), with process talk (reviews, commits, merges, PR housekeeping, test runs) dropped and hashes, PR numbers, counts and model names scrubbed; unticketed time is "Other work". Today is each open session's title, its next stage and "PR in review"; Blockers give the scrubbed REWORK reason. No durations. Entries never overlap. They cover driven time plus waiting time (an agent running while Cooper is not driving, only between two of his turns that day no more than 2 h apart (a turn on the neighbouring day does not count), marked "waiting"; js/time/segments.js waitingSegments); Settings > Entry rounding rounds the entries only. Data arrives through the worklog sync (~/.claude/tools/worklog, README "Timeline sync") and the upload step in the writing protocol.

## Preview

```
node dev/serve.js          # or: npm run serve
```

Open http://localhost:8123/dev/preview.html (add `#leet` for the 1337 skin). `file://` cannot load ES modules. The harness stubs `window.claude.use("db")` with `dev/fixture.js` and loads the real page shell, so it never carries its own copy of the markup.

Headless screenshot (Windows, Git Bash):

```
timeout 60 "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --user-data-dir=<fresh dir> --virtual-time-budget=6000 --window-size=1400,900 \
  --screenshot=<png> "http://localhost:8123/dev/preview.html#leet"
```

The PNG can land a few seconds after Edge exits.

## Test

```
npm test         # node:test over tests/*.test.js
npm run check    # node --check on every .js file
```

No dependencies; Node 22 or later.

## Publish

The page is `orchestration-board.html`; the Artifact skeleton wraps it, so it has no doctype and its `<title>` stays in the first 8 KB. The supporting files go up through the Artifact `files` map with paths relative to this folder (`css/tokens.css`, `css/base.css`, `css/sleek.css`, `css/leet.css`, `js/**/*.js`), which is why every URL in the page is a plain relative path. `dev/`, `tests/`, `package.json` and the docs are not published. Data changes never need a republish.

The Artifact tool reads `files` sources only from a session working directory, not from this folder. So copy `orchestration-board.html`, `css/` and `js/` into a working-dir folder first, publish with that folder as `root` and `url` set to the board, then confirm the 16 published paths with `action: list, scope: files`. The page is served as `index.html`.

## Tour

A first-time viewer gets a short guided tour: each step outlines a real control and explains it. It starts once, when the `board.toured` pref is unset, and finishing, skipping or closing it sets the flag (`js/prefs.js`). Settings > Take the tour and the `?` beside the gear replay it. A step whose control is not on the page (no session yet, the Time page open) is skipped.

To edit the copy, change the `STEPS` array in `js/tour.js` (selector, title, one or two sentences under 25 words each); `tests/tour.test.js` checks those limits. The spotlight and popover live in `js/tour-ui.js`.

## Color schemes

The built-in themes are the schemes in `dev/palettes.json`; each has a light and a dark Sleek variant (following the viewer's light or dark mode) and a 1337 variant. `npm run palettes` turns that file into `css/palettes.css` and `js/palettes.js`. Any text color under 4.5:1 is moved toward white (dark) or black (light) just far enough to pass, which keeps its hue; the script prints each change, and `tests/palettes.test.js` fails if a generated text color reads under 4.5:1. Status colors keep their original hue for fills and borders; their `--ok-text`, `--run-text` and `--bad-text` twins are used for text.

Settings > General > Customize colors opens the theme editor inside the menu. Base picks any built-in or custom theme; below it is one row per token of the current skin (Sleek: page colors, the six ticket colors, status colors; 1337: background, pane, text, dim, faint, green, lime, amber, red, bar border, edge), each with a swatch, a color picker and R G B fields kept in sync. Every change previews live on the page; Cancel (or closing the menu) restores the theme active before opening. Save as new asks for a name inline; Save updates a custom theme (on a built-in with no edits it reads "Use theme" and selects it); Rename and Delete (confirmed inline) are for custom themes; Reset to base drops the edits. A row warns when text reads under 4.5:1 (text and muted on background, text on surface, 1337 text on background); it never blocks a save. The 1337 bar border is the `--t-bar` token. The selected theme applies before first paint: its palette through `:root[data-palette]`, its edits as inline custom properties on `:root`.

To add a scheme, add its official colors to `dev/palettes.json` (tinted-theming/base16 maps as base00 bg, base01 surface, base02 line, base04 muted, base05 ink, base08 red, base0A yellow, base0B green, base0D blue), run `npm run palettes` and `npm test`.

Credits (colors taken from each scheme's official palette file):
- Catppuccin, MIT: https://github.com/catppuccin/palette
- Gruvbox, MIT: https://github.com/morhetz/gruvbox (done uses its aqua; its green sits next to its yellow)
- Solarized, MIT: https://github.com/altercation/solarized (done uses its cyan, for the same reason)
- Tokyo Night, Apache-2.0: https://github.com/folke/tokyonight.nvim
- Everforest, MIT: https://github.com/sainnhe/everforest
- Dracula and Alucard, MIT: https://github.com/dracula/dracula-theme
- Nord, MIT: https://github.com/nordtheme/nord (the light Snow Storm variant is ours, not official)
- Rosé Pine, MIT: https://github.com/rose-pine/rose-pine-palette (no green in the palette, so done is teal)

## Contributing

Teammates: push a branch and open a pull request against `main`. `main` is protected: a PR needs one approving review from the code owner (`CODEOWNERS`), and the owner pushes directly. Run `npm test` and `npm run check` before opening it. Report bugs and ideas in [Issues](https://github.com/Co0pDawg/Orc-Dashboard/issues).
