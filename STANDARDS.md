# Board code standards

Rules for every change to the Orchestration Board. A change that breaks one either fixes it or says why in its own comment.

## Structure

- ES modules only. The page has no inline script; `js/main.js` is the only entry. No globals except the platform's `window.claude` and `window.Sortable`.
- Dependency direction, with no cycles:
  `util.js`, `model.js` (pure) ← `render/*` (strings) ← `board.js` ← `chooser.js`, `layout-edit.js` ← `settings.js` ← `main.js`.
  `state.js` and `prefs.js` sit beside the pure layer and may be read from anywhere above it. Render modules never import a DOM controller.
- `util.js` and `model.js` touch neither the DOM nor storage, so `node --test` can load them directly.
- Render modules return HTML strings and never touch the DOM.

## Markup and styles

- Every value that comes from the db or from storage goes through `esc()` before it lands in HTML, attributes and URLs included (`esc(adoUrl(id))`). Numbers the code computes (counts, percentages) and its own constants (state class names, labels) need no escaping. URLs are built only by helpers (`adoUrl`).
- Colors come only from tokens in `css/tokens.css` and the generated `css/palettes.css` (edit `dev/palettes.json`, then `npm run palettes`). The exceptions are translucent shadows, overlays and scanlines written as raw `rgba()` (`base.css`, `leet.css`), which stay neutral in either theme.
- Skin rules live only in their skin file and start with `.sleek` or `.leet`; `base.css` holds nothing skin-specific. The exception is `body.leet` in `tokens.css`, the 1337 page base, which sits beside the tokens it sets.
- Naming: camelCase functions, kebab-case CSS classes. New JS hooks use `data-*` attributes; the existing id hooks (`#undo`, `#toast`, …) and class hooks (`.grip`, `.corner`, `.slot`) stay as they are.

## State and storage

- All per-viewer storage goes through `prefs.js`, every access wrapped in try/catch; the board must work with storage empty or throwing.
- The page never writes to the db. It is a read-only viewer; Fable and agents write through ArtifactData.
- The page renders its empty state before `window.claude.use("db")` resolves.

## Rendering

- Live timers render pre-filled and refresh through `[data-since]` on the 30-second tick, never by re-rendering.
- A re-render must not steal focus or scroll: reuse nodes (`place`), restore focus through `state.refocus` / `state.chipFocus`, and defer while a drag is in progress (`state.busy`).

## Accessibility

- Real buttons for actions; `aria-pressed` / `aria-expanded` on toggles.
- Announcements go through the `#sr` live region (`say()`).
- Respect `prefers-reduced-motion`.
- Targets are at least 24px. The exception is the 1337 log's inline `[+N]` toggle (`.leet .more`, 20px), which sits inside a 13px text line with nothing near it to hit by mistake.

## Comments

- One short comment per non-obvious rule, saying why, not what.
- Every exported function gets a one-line JSDoc.

## Before publishing

1. `npm test`
2. `npm run check`
3. One preview screenshot per skin (see README, Preview), compared with the last published look.
