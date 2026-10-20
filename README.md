# Orchestration Board

A private claude.ai Artifact (https://claude.ai/artifact/GJS9SUHY6eiX4bp32G65z1, `db` capability) that shows orchestration sessions live: one block per session with an activity log pane and one pane per ticket card moving through its stages. Two skins: Sleek (light and dark cards) and 1337 (a terminal screen). The page only reads the db; Fable and its agents write it through ArtifactData. Code rules are in [STANDARDS.md](STANDARDS.md).

## Files

| Path | Role |
|---|---|
| `orchestration-board.html` | Page shell: title, fonts, the four stylesheets, static markup, Sortable, `js/main.js` |
| `css/tokens.css` | Color and font tokens (light, dark, 1337) and the body base |
| `css/base.css` | Skin-neutral layout and controls |
| `css/sleek.css`, `css/leet.css` | Every rule of one skin, prefixed `.sleek` / `.leet` |
| `js/util.js` | Pure helpers: `esc`, `fmt`, `t12`, `clamp`, `ago`, `adoUrl` (per-session ADO project) |
| `js/model.js` | Pure data logic: card state, stage timing, sub-event windows, visible/live sessions |
| `js/prefs.js` | Every localStorage read and write |
| `js/state.js` | The shared runtime state object |
| `js/render/shared.js`, `sleek.js`, `leet.js` | HTML strings for panes, logs and headers |
| `js/board.js` | Session views, tiles, `render()`, timers, column fitting, Sortable per view |
| `js/chooser.js` | Session chips, Show finished, the 1337 bar color |
| `js/layout-edit.js` | Customize mode: move/resize, corner drag, grip keys, reset menu, undo toast |
| `js/main.js` | The only entry: binds the controllers, applies the skin, subscribes to the db |
| `tests/model.test.js` | `node:test` suite for `model.js` and `util.js` |
| `dev/` | Preview harness (`preview.html`, `preview.js`, `fixture.js`), static server, `check.js`; never published |

## Data contract (what the page reads)

- `sessions/<date>-<project>-<slug>`: `title, ticket, branch, status, started, updated, now, completed?, ado?, events[]`. `ado` is the Azure DevOps `"org/project"` that the session's ticket and task links open in. It defaults to `Cosairus/Petsoft`; set `"Cosairus/Cosairus Payment Services"` for Rise. Petsoft and CosairusAccountingModule use the default. Each event is `{at, text, sub?: [{at, text}], card?: "<card id>"}`. Events are append-only; the page keys expand/collapse state by event index. Sessions sort by `updated` descending. A session is finished when `completed` is set or `status` is Done/Complete/Completed/Finished (any case); finished sessions start minimized and stay off the chips until Show finished is on.
- `cards/<id>`: `session, order, ticket, task, kind, title, agent, tokens, commit, note, updated, stages[], progress[]`. A stage is `{label, state, started?}` with `state` one of `done|active|rework|pending|skipped`; `started` (ISO) is set when a stage turns active or rework, else the page falls back to the card's `updated`. `progress[]` is `{at, text}` lines posted by agents.
- A dispatch event that names `card` nests that card's `progress` from the event's time until the next dispatch for the same card. A running card shows its last three progress lines. The log shows "quiet Nm" since the newest event, sub-event or progress line, amber after 45 minutes.
- Times are ISO with offset.

## Writing protocol (Fable and its agents)

The single source for when the board is written. `~/.claude/CLAUDE.md` says to follow it, so keep it accurate.

Writes go through the ArtifactData tool (load it with ToolSearch `select:ArtifactData`) against the board URL. Writing more than one doc uses `batch`, and every write to an existing doc pins `if_version` to the version last read; on a conflict, re-get and redo. Take times from `date -Iseconds` so they carry an offset. Bump the session's `updated` on every write so it sorts first. Never republish the page for data.

| When | Write |
|---|---|
| **Start**: before the first dispatch of an orchestrated task | Create `sessions/<YYYY-MM-DD>-<project>-<slug>` (title, ticket, branch, status "Planning", started, updated, now, events: [the plan line], plus `ado` when the repo's work items are not in Cosairus/Petsoft) and one `cards/<id>` per ticket or task (session, order, ticket, task, kind, title, stages with every planned stage `pending`, updated). Use one batch. Card ids are short and unique, e.g. the task id. |
| **Dispatch** | The card's stage turns `active` with `started`; set `agent`. Append an event `{at, text: "<agent> dispatched on #<task>", card: "<card id>"}`. Update `now` and `status`. The brief carries `BOARD: <board URL> card <card id>` (marching orders item 10). |
| **Check-in** (Fable reads a running agent's report file, test log or a late notice) | Append `{at, text}` to that dispatch event's `sub`, only if something changed. |
| **Heartbeat** (a dispatch expected to run past ~30 min) | Schedule a check every 20-30 min (Monitor on the agent's report or test-log file, or ScheduleWakeup/CronCreate). Each check posts a check-in. |
| **Report** | The stage turns `done` or `rework` (a rework stage gets a fresh `started`). Set `tokens` and `note`. Append the outcome as a top-level event ("refuter ACCEPT", "builder done: 40 tests pass"). |
| **Commit** | Set the card's `commit`; append an event naming the hash. |
| **Finish**: the task's last write | Session `status: "Done"`, `completed`, a closing `now` ("Draft PR #### opened"), and a final event. Never delete session or card docs unless the user asks. |

Agents write only their own card's `progress[]` (rules in `~/.claude/agents/builder.md` and `refuter.md`), never the session doc, so they cannot collide with Fable's writes. A subagent write needs no permission prompt (probed 2026-10-19).

Per-viewer state lives in localStorage: `board.skin`, `board.layout`, `board.shown` (older `board.session`), `board.fold` (older `board.folded`), `board.cardFold` (minimized cards), `board.showDone`, `board.barColor`.

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
