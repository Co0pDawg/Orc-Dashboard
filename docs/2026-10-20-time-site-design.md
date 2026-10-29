# Time: a second page on the Orchestration Board

## Intent

Hours go into a time-entry portal, one "Work Detail" form per entry. Today the worklog roll-up (`C:\Development\worklog\worklog.ps1`) turns hook events into portal lines. The lines are text, they are guessed into 15-minute blocks, and they hide what actually happened. Several Claude sessions and their agents run at once, and none of that is visible.

The goal is a visual model of the day and week that shows real session time, plus entries that copy into the Work Detail form quickly.

The rule that governs every entry: the portal records **hours worked**. Parallel work must never be entered twice. If two tickets ran in parallel for two hours, entering both would record four hours worked. The pre-AI portal cannot express parallel work.

## Goals

1. A **Time** page beside the existing **Board** page, with three tabs:
   - **Day:** a column per ticket (mockup B in the brainstorm).
   - **Week:** one column per day with parallel work stacked as bands (mockup C).
   - **Month:** a compact calendar of days.
2. The views show **actual session time to the minute**: when Cooper was driving a session, and when agents ran unattended.
3. Each day yields **suggested entries** shaped like the Work Detail form: Ticket (`PET-NNNNN`), Start Date, Start Time, End Time, Note, and the Unplanned Time and Review Time toggles.
   - Every field has its own copy button.
   - Entries never overlap, and a day's entries add up to the time Cooper was actually driving.
4. A **rounding** setting, for the entries only: Exact (whole minutes), 5, 10, 15 or 30 minutes. The default is 15, which is how he enters time today. The views always show exact time.
5. Times come from a reliable source, not from sessions remembering to report them (see Data).

## Non-goals

- Entering time into the portal automatically. Cooper copies the fields himself.
- Meetings, scrum, breaks and other non-Claude time. Cooper enters those himself. A session left running through a meeting does not count unless he prompts it.
- Replacing `worklog.ps1`. It stays. The Time page reuses its ticket attribution.
- Billing for agent time. Agents running unattended are shown but never become entries.

## Anti-goals (a failure even if it works)

- Entries that overlap, or a day total larger than the time actually driven.
- Prompt text, or anything Cooper typed, leaving his machine. The sync uploads times, tickets, session ids and project names only.
- A second set of ticket-attribution rules that drifts from the worklog's.

## Decisions Cooper made

- Two pages: Board and Time. Day, Week and Month are tabs under Time.
- The Day view is a column per ticket; the Week view is one column per day with stacked bands.
- When tickets overlap, the time goes to the session Cooper was **actively driving**.
- Views show actual time. Rounding is a setting that applies to the entries only.
- Data path is option 2: the existing worklog hooks keep recording locally, and a sync uploads to the board database. Agents' own records fill in the unattended spans.
- Entries match the Work Detail form so they are easy to copy.

## Data

### What already exists

- **Worklog hooks** (`C:\Development\worklog\log-event.ps1`) append to `~/.claude/worklog/<YYYY-MM-DD>.csv`, one row per event: `time,kind,ticket,session,cwd,text`.
  - Kinds include `prompt`, `stop`, `notify`, `tool`/`agent`, `az`/`ado`.
  - A ticket ending in `*` marks explicit evidence.
  - `sessions.map` holds per-session ticket overrides.
  - History goes back to 2026-09-22.
- **The board database** (the board artifact, `db` capability, private to its owner). It holds `sessions/*` and `cards/*`.
  - Dispatch events name their `card`.
  - Report events follow them.
  - Cards carry agent `progress[]` lines with times.

### New: `timeline/<YYYY-MM-DD>`

> Built as (plan refinement, 2026-10-20): the sync uploads the day's re-ticketed **events** `{at, kind, session, ticket}` rather than precomputed segments, and the page computes driving segments (`js/time/segments.js`). The scheduled sync only builds the file; Claude sessions upload it (Cooper's choice: headless runs cannot write to the board without an approval).

One document per day, written only by the sync:

```
{date, synced: <ISO>, tz: "<offset>",
 sessions: {<session id>: {project, title?}},
 segments: [{session, start, end, ticket}],        // Cooper driving, exact times; ticket null = No ticket
 agents: [{session, at, ticket}],                  // agent dispatches outside the board (markers)
 notes: {<ticket>: "<one-line description>"},      // from the worklog's description step
 flags: {<ticket>: {review?: true, unplanned?: true}}}
```

**Driving segments (Cooper's rule).** Cooper drives a session from a `prompt` in it through that turn's `stop`. A long silent turn still counts: the hooks do not log plain edits or test runs. He keeps driving for up to 15 minutes after the `stop`. The segment ends early the moment he prompts a different session, which takes over. The 15 minutes is a constant in the sync.

Time with no `PET-` ticket (`UNKNOWN`, a bare `PR-NNNN`, or a session mapped to `-`) stays in: it gets the ticket `null` and is drawn and entered as "No ticket" (Cooper's call).

The segment's ticket comes from the worklog's existing attribution (per-session evidence re-ticketing, `sessions.map`, branch fallback). The sync gets it from the worklog code; it does not recompute it.

**Agent spans** need no new writes. The Time page derives them from the board's own `sessions/*` events: from a dispatch event with `card` to the next event for the same card, with `cards/*.progress[]` times as extra points. If a span has no end, it ends at that card's last progress line or the session's `updated`.

- A span joins a Day column through the card's `task`, falling back to its `ticket`, normalized to `PET-NNNNN`.
- Agents dispatched outside an orchestrated (boarded) task appear only as point markers at their dispatch time. These come from the CSV's `agent` rows, which the sync uploads as `agents: [{session, at, ticket}]` (my call).

### Sync

1. A script in the worklog repo (proposed name: `sync-timeline.ps1`) reads one day's CSV and runs the worklog's attribution logic. It then emits the `timeline` JSON above. It drops prompt text and everything else not in that shape.
   - **`worklog.ps1`'s existing output must stay byte-identical** (my call: Cooper uses it today). Any refactor for reuse must be proven by its existing tests.
   - **The sync never calls a model**, so a 15-minute tick is cheap. `notes` come from the most recent `worklog.ps1` roll-up for that day (`<date>.txt`) when one exists, matched by ticket, else empty.
   - ADO lookups (for the Unplanned flag) are cached per ticket and day so a tick does not re-query.
   - CSV times are local with no offset. Convert each with the local time zone's offset at that instant (`TimeZoneInfo`), so DST is right for backfilled dates.
2. A headless `claude -p` call (cheap model) writes that JSON to `timeline/<date>` with ArtifactData. It pins `if_version` when the document exists.
3. Cadence:
   - A Task Scheduler job every 15 minutes while Cooper is logged on, shaped like the jobs in `~/.claude/docs/ops-automation.md` (state folder, unchanged-input marker so an idle day costs no model call, time limit, log). The marker covers the day's CSV, `sessions.map` and the day's `.map`/`.txt`, which are the inputs that change the output. Missed ticks while logged off are fine, because the next run or a backfill catches up (my call).
   - Each run replaces `timeline/<date>` wholesale. The sync is its only writer, so pinned `if_version` with one re-read and retry is the only conflict handling, and no history is kept (my call).
   - The same script runs on demand for a given date.
4. **Backfill:** run the script once per existing CSV, from 2026-09-22 onward.

## The Time page

- **Navigation:** top-level Board | Time.
  - My call: both are views of the one existing page, so they share the db connection, Settings, skins and color schemes.
  - The view is in the URL as a plain hash token (`#time`, `#time-week`), since the artifact passes only plain tokens.
- **Date controls:** previous and next day (or week), today, and a date picker.

### Day tab (column per ticket)

- A time axis runs down the left; one column per ticket that had driving or agent time that day.
- In each column:
  - Cooper's driving time is drawn solid.
  - Agent spans for that ticket's cards are drawn hatched, beside the solid blocks.
  - The header shows the ticket, its driven total, and its agent total.
- Beside the columns, an **Entries** panel lists the day's suggested entries in time order, with a copy button per field.
- The day total of entries is shown next to the exact driven total, and they must agree within one rounding unit.

### Week tab (column per day)

- Seven day columns on the same time axis.
- Each moment is split into bands for what ran: the driven ticket solid, and agents as fainter bands.
- Each day header shows that day's driven total; the week total sits at the top.
- Clicking a day opens its Day tab.

### Entries (pure logic, unit-tested)

1. Start from the day's driving segments.
2. Merge back-to-back segments with the same ticket.
3. Round each start and end to the nearest rounding unit. A rounded entry may not overlap its neighbors.
4. An entry never spans an idle gap: segments separated by more than one rounding unit stay separate entries (my call).
5. An entry that rounds to zero length merges into a neighbor it touches after rounding, preferring one with the same ticket. If it touches nothing, it is not entered. (Built narrower than first written: extending a neighbor across a gap of up to one unit broke rule 6's bound.) It is listed under the entries as "Not entered: N min" so no time disappears silently (my call).
6. The rounded total plus the "Not entered" minutes must stay within one unit per entry of the exact driven total. Unit tests check this.
7. Split any entry longer than **2 hours** (the portal's maximum) into pieces of at most 2 hours.
8. "No ticket" entries keep an empty Ticket field and a visible "needs a ticket" flag. Cooper fills them in by hand.

- **Note:** the ticket's `notes` line, editable on the page before copying. The edit is not saved. My call.
- **Toggles:** shown as suggestions from `flags`, which are my guess:
  - **Review** when the work was a review of someone else's PR (a `/peer-review` session).
  - **Unplanned** when the ticket is a Support Item.
- **Rounding** is a Settings choice, saved per viewer like the other settings.

### Month tab (Cooper's addition)

A calendar grid, one cell per day, Monday-first, with weeks as rows. The tab is reached as `#time-month`.

- Each cell, compact:
  - the date and the day's driven total;
  - a thin horizontal bar split by ticket in proportion to driven time, with colors matching the Day and Week views;
  - a small mark when agents also ran unattended that day.
- The header shows the month total and each row ends with its week total.
- Clicking a cell opens that day in the Day tab. Each cell also carries a small Scrum button.
- Days with no data stay blank.
- Month navigation: previous, next, and this month.
- At phone width the grid collapses to a list of days (my call).

### Scrum summary (Cooper's addition)

A summary of one day to bring to the morning meeting.

- **Entry point:** a **Scrum** button on every day.
  - The Day tab has one, in its header.
  - The Week tab has one in each day column's header.
  - The Month tab has one in each cell.
- **Output:** a modal that shows the summary as a plain list Cooper can read and copy from. It has one Copy button for the whole list, and the text is selectable. There is no editing and no separate tab.
- **Content**, generated from the data with no model call (my call):
  - **Yesterday:** one line per ticket worked that day, most driven time first: `PET-NNNNN <title>, <driven time>: <outcomes>`.
    - Titles come from the board cards and sessions for that ticket, else the ticket alone.
    - Outcomes come from that day's board events for the ticket: commits, PR opened or updated, ACCEPT or REWORK, done. If the day has no board events, they fall back to the timeline's `notes` line.
  - **Today:** for each session unfinished at the end of that day, its last `now` line and its next pending stage, plus its PR if it is still draft or active.
  - **Blockers:** stages still in rework at the end of that day, with the reason from the last REWORK event; else "None".
- The section headings and bullets are plain text, so the list pastes cleanly into a chat or notes.

### Look

The Time page uses the board's existing skins (Sleek and 1337), color schemes and tokens. It follows `STANDARDS.md`: pure logic in `model`-style modules with `node:test` coverage, string-only renderers, and controllers.

## Constraints

- The page cannot read local files or call anything but its own db, so every time on it arrives through the sync.
- The db document limit is 1 MiB. A day of segments is small, but the sync must not upload raw CSV rows.
- The worklog repo is local-only (no remote). The board repo is on GitHub (private).
- **Unverified: whether a headless `claude -p` run has the ArtifactData tool.** It is the first thing to test.
  - If it does not, the sync script still produces the JSON, and an interactive session uploads it on request ("sync my timeline").
  - The design must work either way.

## Left to the builder

- Module boundaries for the Time page, inside the board's standards.
- Exact visual treatment of hatched agent spans, bands and copy buttons in both skins.
- How the sync script reuses `worklog.ps1`'s attribution: shared functions, or an `-Export` mode on `worklog.ps1`.
- Handling a day that spans a timezone change. Times are stored as ISO with offset.

## Calls made in the design (not Cooper's; check these)

- Board and Time are views of the one existing page, with plain hash tokens (`#time`, `#time-week`), not separate HTML files.
- The idle tail after a `stop` is 15 minutes.
- The sync never calls a model; notes come from the day's `worklog.ps1` roll-up when one exists. `worklog.ps1` output stays byte-identical.
- Entries never span an idle gap. A fragment that rounds to nothing merges into a touching neighbor, or is listed as "Not entered: N min".
- Note edits on the page are not saved.
- Review and Unplanned are suggestions: Review for `/peer-review` sessions, Unplanned for Support Items.
- Agents outside a boarded task show as dispatch markers only.
- Each sync replaces the day's document; no history.
- DST is handled with the local time zone's offset at each instant.
- The scrum summary is built from the data with no model call, and its three sections are Yesterday, Today and Blockers.
