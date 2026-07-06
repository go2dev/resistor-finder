# Overhaul plan — reconciled (checkpoint for review)

Produced per `docs/overhaul-brief.md`. Sources: full parity audit of all four legacy surfaces against `app/` (2026-07-06, this branch = `overhaul-session` at tip of `cursor/sveltekit-greenfield-foundation-8189`), plus a web survey of reusable schematic renderers.

Status legend: `[x]` at parity · `[~]` present but different (gap noted) · `[ ]` missing · `(D)` explicitly deferred with reason.

---

## 1. Parity checklist — legacy features vs `app/`

### 1.1 Voltage divider (`index.html` → `app/src/routes/voltage-divider`)

- [x] Supply / target voltage inputs, validation (target > supply, > 0)
- [x] Resistor values input; rich parsing (RKM, EIA-96, tolerance `(1%)`/letter, power codes)
- [x] Autofill common values (decade + series selects); autofill JLC Basics
- [x] Snap-to-E-series toggle + series select (app: top-of-form; legacy: inside results — accepted difference)
- [x] Allow-overshoot toggle; 4 sort modes (error / components / totalR asc / desc)
- [x] Parallel Web-Worker search — app drives the actual legacy `resistor-worker.js` with identical chunking
- [x] Combination generation (single / series-pair / parallel-pair) — mirrored in `legacy-divider-combos.ts`
- [x] Tolerance-aware real-world Vout range (4-corner)
- [x] Ratio dedupe cross-chunk (app `worker-divider-result.ts`; legacy lacks it — fixed as part of the divider bug, §3)
- [x] **Divider ranking bug** — FIXED (commit 0e82f57, details §3); verified end-to-end in a headless browser: `1k/5k1` is now result #1 at 3V3→2.76V.
- [x] Top-5 results: R_TOP/R_BOT, ratio, totalR, Vout, error, component count, Vout range, power (top/bot/total), min package recommendation, power warnings
- [x] Per-result supply slider with live Vout/power/package updates (native range input vs noUiSlider — accepted)
- [x] Per-result schematic + PNG export — the code-level audit called this equivalent, but driving the app in a browser showed every schematic silently rendered nothing (`class Diagram` never becomes `window.Diagram`); FIXED in 3f20055 and verified rendering on all cards
- [x] Parsed-value chips: series colours, click include/exclude, tooltips
- [x] Chip tooltip depth — DONE (24548ca): ohms, series/non-standard, tolerance provenance, power code+watts, JLC list/sizes/catalog tolerances
- [x] JLC chip caption — DONE (24548ca): visible JLC tag on chips
- [~] Parse-warnings: legacy structured table vs app bullet list → kept list deliberately (denser); content parity holds
- [~] "Calculation Details" panel → compact stats line exists (combos · workers · ms · raw match count); full input-conversion table + voltage distribution DEFERRED — superseded by chip tooltips and the stats line; revisit only if missed
- [x] Live recalc on supply/target/overshoot/snap change — DONE (24548ca, debounced)
- [~] Loading spinner + chunk progress (divider page: button label + stats line only) → DEFERRED, small; target-resistance got the full progress readout, divider worker chunks finish in <1s for realistic inputs
- [x] Zoomable total-resistance histogram filter (legacy widget reused; app adds numeric min/max + reset — improvement, keep)
- [~] Input token dedupe rewrites the text field in legacy; app doesn't rewrite → accepted difference (app dedupes internally)
- [~] App caps input at 30 unique values with warning; legacy uncapped → accepted (documented perf guard)

### 1.2 Target resistance (`target-resistance.html` → `app/src/routes/target-resistance`)

- [x] Target input (with tolerance-bracket parse), resistor set input, autofills, snap, 4 sort modes
- [x] Blocks model (singles + parallel blocks), series combos, top-block pre-ranking, 20% error cutoff w/ fallback
- [x] Worker offload ≥6 inputs, multi-worker chunking, main-thread fallback
- [x] **Schematic diagram per result** — DONE (1f964c0): `Diagram.renderNetwork` via new target-network-diagram.svelte, with text fallback
- [x] **PNG export per result** — DONE (1f964c0): legacy filename convention, shared export service
- [x] Tolerance-overlap pruning — DONE (1f964c0): ported to $lib/domain/target-resistance.ts + inline worker; proven against a verbatim legacy oracle in tests
- [x] `applyResistorHeuristic` extremes preservation — DONE (1f964c0), oracle-tested
- [x] `getEffectiveLimits` tiers + `maxParallelCombos` guard — DONE (1f964c0), tier tests
- [~] Results count: app keeps top-40 (legacy 5) — deliberate improvement, every card gets a diagram; revisit if unwanted
- [x] Worker progress messages + readout — DONE (1f964c0): N / M (x%) while calculating
- [x] Sort reset to "error" on recalc — DONE (1f964c0)
- [x] Dedupe equivalence — covered by the legacy-oracle generator tests (1f964c0)
- [x] Stats panel: block count, pruned blocks/combos, calc time ms — DONE (1f964c0)
- [~] error-high (>20%) visual flag → DEFERRED (minor; the 20% cutoff fallback message exists)
- [x] Power-rating watts captured for chip tooltips (voltage divider); target-resistance chips show power code — remaining watts display there DEFERRED (minor)

### 1.3 Balanced attenuator (`balanced-attenuator.html` → app route)

App injects the identical legacy scripts (attenuator-engine, script.js, schematic.js, diagram-export, common-ui) — computation, diagrams, export, live-recalc are byte-identical.

- [x] All inputs (type select, Vin, dB, Zload, Zin/Zout targets, min power), hints, hidden target field
- [x] U-pad/L-pad math, result cards, schematics, PNG export, spinner
- [x] Live recalc wiring; sort; overshoot
- [~] H1 help tooltip + overshoot/filter "?" tooltips → replaced by one-line descriptions in the restyle; legacy "?" bubbles now render inside the injected results DOM (chip-grid CSS ported, 3323ace); full help-affordance pass DEFERRED to the engine-migration rebuild of this page
- [x] Vestigial resistance slider inert in both (not a regression)

### 1.4 Interactive divider (`interactive-divider.html` → app route)

Also injects identical legacy scripts.

- [x] Supply input, snap, series select; live updates
- [x] Interactive SVG (click-to-edit dialog, add series/parallel, remove, hover tooltips, touch hint)
- [x] Results table (nominal+range Rtop/Rbot, totalR, current, power, package, Vout + range, warnings)
- [x] `ModePanel` scaffold removed (3323ace)
- [x] No export in legacy either (loads diagram-export but never calls it) — parity holds

### 1.5 Cross-cutting / shell

- [x] Theme — DONE (24548ca): system-pref default + live listener; explicit toggle persists and wins; app keeps its own key. Legacy-injected pages no longer clobber it (3323ace).
- [x] Footer — DONE (24548ca): disclaimer, credit, GitHub link, version.json readout (+ version chip in the header)
- [ ] Documentation/readme surface + nav link → DEFERRED (P2): decide between a `/docs` route rendering README and a plain GitHub link; legacy readme.html still serves at the root deployment
- [x] Nav between 4 modes (app shell)
- [x] JLC catalog loading + embedded fallback (byte-identical data); autofill; chip flags
- [x] URL params: absent in both (feature-gated, §4)
- [x] **Tests** — DONE: Vitest configured (`cd app && npm test`), 24 tests across divider ranking and target-resistance engine (incl. legacy oracles)
- [x] Legacy root app untouched and green (`node tests/run-tests.js`)

---

## 2. Diagram engine — recommendation (workstream 2)

**Recommendation: build a minimal Svelte-native SVG schematic engine, harvesting symbol geometry from `tscircuit/schematic-symbols` (MIT), rather than adapting a full renderer or building a D3 engine from scratch.**

Survey summary (details in the session research; ranked):

1. **Custom Svelte SVG components** — Each schematic element is a Svelte component emitting `<g>`; hover/click/focus, `class:` styling, CSS-variable theming (`var(--wt-*)`), ARIA/tabindex all come free from Svelte. Our topologies are fixed and known (divider, U/L-pad, R-network) — a layout engine, the expensive part of every surveyed library, is unnecessary. Symbol paths (resistor, source, ground, ports, `{REF}`/`{VAL}` anchors) can be copied from `tscircuit/schematic-symbols` (MIT, 315 symbols) rather than drawn by hand. Est. ~150–300 lines, zero runtime deps.
2. **Adapt `circuit-to-svg` (tscircuit, ISC)** — the only existing renderer meeting every bar: SVG output with `data-schematic-component-id` per element, `css`/`colorOverrides` theming, light bundle, very active. Costs: Circuit JSON verbosity, tscircuit aesthetics, 0.0.x API churn. **Fallback choice** if we later need arbitrary user-defined circuits.
3. Rejected: `kicanvas` (canvas/WebGL, no per-component DOM, alpha embed API, needs `.kicad_sch` files — a viewer, not a state-driven renderer); `netlistsvg` (402 KB gzip ELK, dormant, no layout control); `d3-hwschematic` (digital-only symbols, EPL-2.0); CircuitJS1/circuitikz/schemdraw ports (GPL / Python / none exist).

Why not D3-from-scratch: for fixed topologies D3's value (data joins, scales, layout) buys nothing Svelte reactivity doesn't already provide; it would add a dependency and an idiom foreign to the rest of the app.

**PoC delivered and iterated** (per brief): divider, arbitrary nested networks and a balanced U-pad rendered by the favoured approach with per-part V/I/P tooltips, theme awareness, and reviewed layout rules (centring, mitred corners, junction dots, slim symbols) at `/app/diagram-poc`. **Gate CLEARED: owner approved the PoC 2026-07-06.** Build-out is the next tranche — see `docs/diagram-engine-brief.md`.

## 3. Divider correctness bug (fix now, part of parity)

Root cause (empirically reproduced with the real worker code in Node):

- The 2-resistor `1k/5k1` answer at 3V3→2.76 V **is** found by the search and survives to `allResults` (error −0.98 mV).
- The default "Lowest Error" display sorts by raw nominal error and slices to five: 3–4-part combos with meaninglessly smaller nominal error (0.1–0.2 mV — invisible at display precision and far below even 0.1%-tolerance physical variation) occupy all five slots.
- Legacy additionally lets exact-same-ratio duplicates survive across worker chunks (`1k||1k / 5k1||5k1` alongside `1k / 5k1`), crowding the list; the app already dedupes cross-chunk.

General fix (no special-casing):

1. Rank "Lowest Error" mode by |error| **quantized to 0.1% of supply voltage** (the point below which nominal differences are physically meaningless), tie-broken by component count, then exact |error|, then total resistance. Applied to legacy (`ResistorUtils` pure helper + `filterAndSortResults`) and the app (`voltage-divider.ts`), divider mode only (attenuator ranking untouched).
2. Add cross-chunk ratio dedupe to the legacy display path (parity with the app's `dedupeDividerRatiosRaw`).
3. Failing tests first: legacy Node test drives the real `resistor-worker.js` pipeline; app gets Vitest (new — the app currently has zero test infra) with the same scenario through the exhaustive fallback + shared sort.

## 4. Feature build/gating order (planning notes → sequenced)

Ordering principle: correctness → parity → deploy-readiness first (this session); features that reshape result presentation before features that add modes; anything drawing schematics waits for the diagram-engine decision; anything restyling waits for the tool-grade restyle baseline.

**Phase 0 — this session (settled, low-risk):** divider bug fix + tests; app test infra (Vitest); parity fixes P1 (target-resistance diagrams+export via existing `schematic.js` adapter, pruning/heuristic/limits parity, theme system-pref, footer+version); restyle (workstream 3); deploy prep (workstream 5); diagram PoC (workstream 2, PoC only).

**Phase 1 — gated on sign-off (diagram engine):** build-out of the Svelte SVG engine; migrate voltage-divider result schematics, then interactive divider (most interactivity value), then attenuator + target-resistance networks; retire `schematic.js` after parity tests. *Dependency: theme/restyle tokens should be settled first so engine styling is written against final CSS variables once.*

> **DONE 2026-07-06** (sign-off received, docs/diagram-engine-brief.md executed): engine graduated to `app/src/lib/diagram/engine/`; all four pages migrated in the order above; app-side schematic.js adapters removed (root site untouched); `/app/diagram-poc` is now the engine gallery. State record: `docs/unified-diagram-roadmap.md`.

**Phase 2 — result-set UX (needs restyle, benefits from engine, no hard dependency):**
1. **Histogram of result distribution** across the resistance range — extends the existing zoomable filter; do first, it's the substrate for the next item.
2. **Total-resistance filter refinement** — split lookup-zone vs filter control per the "D3 zoomable range slider" spec (noUiSlider + d3-zoom, three domains, wheel/pinch, drag-pan over histogram, Fit buttons, keyboard/a11y). Notion child page unreachable from this machine — implement from the summary in the brief.
3. **URL parameter encoding / deep links** — small, independent; also wanted for sharing before PDF export.
4. **PDF export** — after restyle (export should capture the final look); builds on existing PNG pipeline.

**Phase 3 — BOM-optimisation core (frame everything around this):**
1. **JLC precision/order codes** — check precision percentages in the predetermined set (or worst-case); surface LCSC order codes for the most precise version of a value; prefer JLC-basic values in any mode. Data already embedded (`tolerance_fraction`, `lcsc` fields exist); mostly UI + ranking work. *Dependency: restyle (results table density), none on engine.*
2. **Spec-an-existing-divider mode** (given divider → same/close-ratio configs) + **define-by-ratio mode** — new search entry points over the existing combination machinery.
3. **Fixed-resistors / vary-input-voltage mode** — small; shares the per-result supply-slider machinery that already exists.

**Phase 4 — new modes (each gated individually):** U-pad attenuator polish (engine exists behind the balanced page; needs its own mode surface), **current-divider mode** (from `todo.md`).

**Phase 5 — once on wt (post-cutover housekeeping):** conventional-commit history rewrite + release-please/commitizen. *Explicitly deferred: rewriting shared history is outward-facing.*

## 5. Cross-workstream interdependencies

- **Theme ↔ diagram styling:** the new engine must consume `--wt-*`-derived CSS variables; the restyle decides those variables. Restyle lands first (this session, local to `app/`); engine build-out (gated) reads its tokens. `design-tokens.css` already bridges legacy `--color-*`/`--text-color` for `schematic.js` — keep the bridge until the engine replaces it.
- **Restyle ↔ shared wt-theme extraction:** all restyle work stays in `app/` (`src/lib/styles/` utilities + component classes). Promotion candidates, flagged for a later gated extraction into `@go2dev/wt-theme` (canonical repo `go2dev/whatever-together`): a **density scale** (compact spacing/typography tokens for tool UIs vs marketing hero), **form-control primitives** (input/select/switch at tool density), **data-table styles**, and **status tones** (warning/error/ok chips). Anything screaming "resistor" (series colours, schematic strokes) stays app-local.
- **Deploy base-path ↔ domain cutover:** app is built under `paths.base=/app` so legacy and app can be served from one origin during migration (legacy at `/`, app assets under `/app`). The eventual cutover to serving the new app at `/` on resistordivider.com only needs a base-path change (`kit.paths.base = ''`) + rebuild + route redirects for the legacy `.html` URLs; the Docker/Dokploy setup (workstream 5 docs) is written to make that a one-line change. Until cutover, the deploy serves both from one static image.
- **Worker files ↔ static adapter:** the app loads legacy `resistor-worker.js`/`schematic.js` from the repo root via the `$legacy` alias at build time; the deploy image must ship those assets — covered in the deploy runbook.
- **JLC features ↔ result ranking:** "prefer JLC basics" (Phase 3) interacts with the new error-bucket ranking (§3) — a further tie-break level, which the §3 comparator is structured to accept.

## 6. Verification gates (from the brief)

- Legacy `node tests/run-tests.js` green at every commit; app `npm run build` + `npm run check` (+ `npm test` once Vitest lands) green.
- Divider bug: failing test committed first, then the fix.
- This checklist kept current; every unticked legacy feature either fixed this session or carries a deferral reason.
- Diagram PoC renders a real divider; restyle verified in light and dark.
- Final fresh-context verification pass over each workstream, outcome recorded in `progress.txt`.
