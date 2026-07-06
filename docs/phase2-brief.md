# Phase 2 — result-set UX (brief, autonomous session)

You're building Phase 2 from `docs/overhaul-plan.md` §4 for the Resistor Divider tool (repo: go2dev/resistor-finder): the result-set UX features that reshape how search results are explored — histogram, filter refinement, deep links, PDF export — plus the small parity items deferred from the overhaul session. The diagram engine is done and is the production renderer (see `docs/unified-diagram-roadmap.md`); this tranche builds on top of it, not inside it.

## Starting point

- Branch: start from `v2`. **Process: work on a feature branch, merge to `v2` to deploy** — CI builds every push to `v2` and hosts it at https://public-sites-resistordividercom-aaqcco-ae7de6-95-216-211-185.sslip.io (legacy at `/`, app at `/app/`). Test-server deploys via v2 are yours to do freely; production/domain changes are not.
- Read first: `progress.txt` (sessions 1–2), `docs/overhaul-plan.md` §4–5, `docs/unified-diagram-roadmap.md`, `AGENTS.md`.
- Baselines before writing code: `node tests/run-tests.js`; `cd app && npm test && npm run check && npm run build`; `cd app && npm run smoke` (20 checks — keep it green and extend it for every feature you add). Note: the deployed test server currently serves a self-signed cert — use `ignoreHTTPSErrors`/`curl -k` when verifying deploys; do NOT spend time fixing TLS (owner: out of scope).
- The zoomable total-resistance filter exists as legacy `zoomable-range-filter.js` loaded via `$lib/adapters/zoomable-range-filter-browser.ts` on the voltage-divider page. The divider result model and ranking live in `app/src/lib/domain/voltage-divider.ts` (+ worker client).

## The work (in order; each item independently shippable)

### 1. Histogram of result distribution

Show the distribution of raw matches across the total-resistance range on the voltage-divider page, as the substrate the filter sits on. Requirements:
- Derived from the full raw result set (all matches, not the displayed top 5), recomputed on calculate and cheap enough to not block the UI.
- Svelte-native SVG in the app's visual language (wt tokens, light+dark without JS) — do not bolt D3 DOM manipulation onto Svelte; d3 scale/array *functions* are fine if needed.
- Log-x binning matched to the resistance domain; bars must read at tool density (this sits inside the filter strip, not a dashboard).

### 2. Total-resistance filter refinement

Split lookup-zone vs filter control per the "D3 zoomable range slider" spec summary (the Notion child page is unreachable from this machine — implement from this summary, flag anything ambiguous instead of inventing):
- Three domains: full data domain, zoomed view domain, selected filter range.
- Wheel/pinch zoom and drag-pan over the histogram; the noUiSlider-style handles select the filter range within the current view.
- "Fit" buttons (fit view to data / to selection); keyboard accessibility and ARIA on handles.
- The existing legacy `zoomable-range-filter.js` behaviour is the parity floor; decide (and record) whether to refactor it or replace it Svelte-native — replacement is preferred if it keeps behaviour, since this page is otherwise legacy-free.

### 3. URL parameter encoding / deep links

- Encode each mode's inputs (and ideally sort/filter state) in the URL; loading a deep link reproduces the calculation. Voltage divider first, then target resistance; attenuator only if trivial (its inputs are legacy-DOM-owned).
- Keep URLs human-readable and stable — this is a sharing format, treat the schema as an API. Document it in `docs/`.
- Copy-link affordance in the UI; no history spam while typing (replaceState debounce).

### 4. PDF export

- Per-result PDF building on the existing PNG pipeline (`$lib/services/diagram-export.ts`): schematic + the card's key figures (values, Vout, error, range, power, package rec) in a clean printable layout.
- Client-side only, no server. Choose the smallest dependency that does the job (or none, via print CSS — evaluate both, record the decision and why).
- Must respect the export rules in `docs/unified-diagram-roadmap.md` (currentColor resolution, inline label styles); export is always ink-on-white regardless of app theme. Verify the actual downloaded file from both themes.

### 5. Small parity/polish items (deferred from session 1 — do after 1–2, interleave as convenient)

- Divider chunk-progress spinner (worker progress messages exist; surface them).
- Target-resistance: error-high flag + watts tooltip line (see session-1 deferral notes in `progress.txt`).
- Attenuator help bubbles (legacy has them; app page lost them).
- App readme/docs surface (P2 from the parity audit): make the root `readme.html` content reachable in-app.

## Decisions to surface to the owner (pause and ask; don't guess)

1. URL schema: short opaque params vs readable key=value (recommend readable); whether filter/sort state belongs in the URL by default.
2. PDF: single result per PDF vs "export all top-5"; branding/footer content.
3. Histogram: displayed metric (count per bin only, or error-weighted shading).
4. Carried over from the engine tranche (implemented as parity/likely-yes, awaiting confirmation — don't rework unless told): U-pad Vout stays tap-to-ground; VD card tooltips at live slider supply; attenuator tooltips show unloaded network figures.

## Still gated (do NOT do)

- wt-theme extraction of the density layer (owner: not yet).
- Phase 3+ (JLC order codes/ranking, spec-a-divider / ratio / fixed-R modes, current divider), history rewrite.
- Root-site changes (including the known script.js download-button bug — leave it), TLS/cert work, production/domain changes. No credentials exist here.

## Constraints and working practice

- Conventional commits; commit after each completed component — sessions can be cut off without warning.
- Keep `progress.txt` current; tick `docs/overhaul-plan.md` §4 as items land.
- Tests verify correctness, they don't define it: no hard-coding to test inputs; flag any test asserting wrong behaviour instead of coding around it.
- Every feature: vitest for the pure logic, `npm run smoke` extended to drive the UI, light+dark screenshots recorded under `docs/evidence/` (pattern from `docs/evidence/diagram-engine-2026-07-06/`), deployed via `v2` and verified on the test server.
- End state for this session: at minimum items 1–2 (histogram + refined filter) live on the deployed test server; 3–5 as time allows, each individually shippable.

## Verification (before calling any part done)

- `node tests/run-tests.js` green; `cd app && npm test && npm run check && npm run build` green; `npm run smoke` green including newly covered UI.
- New UI visually verified in light AND dark on the deployed test server; PDF/PNG artifacts actually downloaded and opened, both themes.
- A fresh-context verifier pass over this brief at the end, outcome recorded in `progress.txt`.
