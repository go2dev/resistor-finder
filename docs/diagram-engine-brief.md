# Diagram engine build-out — brief (autonomous session)

You're building out the production diagram engine for the Resistor Divider tool (repo: go2dev/resistor-finder), replacing `schematic.js` inside the SvelteKit app. The proof of concept has been reviewed and **approved** by the owner (2026-07-06): Svelte components emitting SVG, no renderer library, no D3 — see `docs/overhaul-plan.md` §2 for the evaluated alternatives and why they lost.

## Starting point

- Branch: start from `v2`. **Process: work on a feature branch, merge to `v2` to deploy** — CI builds every push to `v2` and hosts it at https://public-sites-resistordividercom-aaqcco-ae7de6-95-216-211-185.sslip.io (legacy at `/`, app at `/app/`). Merging to `v2` (test deploys) is yours to do freely; anything touching production or the real domain is not.
- Read first: `progress.txt`, `docs/overhaul-plan.md`, `docs/unified-diagram-roadmap.md`, `AGENTS.md`. Run both suites before writing code: `node tests/run-tests.js` and `cd app && npm test && npm run check && npm run build`. Browser verification: `cd app && npm run smoke` (playwright; `npx playwright install chromium` once, may need `sudo npx playwright install-deps chromium`).
- The approved PoC lives at `app/src/lib/components/diagrams/poc/` and renders at `/app/diagram-poc`:
  - `poc-network.ts` — series/parallel tree model, recursive pure layout (branch columns, bus bars, vertical centring, mitred corner paths, junction-dot rules), electrical annotation (per-part V/I/P).
  - `network-schematic.svelte` — vertical-rail renderer with per-part hover/focus tooltips.
  - `upad-balanced-schematic.svelte` — balanced attenuator shape (horizontal legs, vertical shunt).
  - `svelte-schematic-divider.svelte` — the original fixed-divider PoC (superseded by the network renderer; fold in or retire).
- Style decisions already made during review: slim zigzags (46px body, 6px amplitude, 5 teeth, 2px stroke), branches vertically centred, junction dots only at 3-way joins, corner paths must overlap into leads (see `LEAD_OVERLAP` — zero-length drops render no mitre join).

## The work

### 1. Graduate the PoC into the engine

Promote the PoC into a first-class module (suggested home: `app/src/lib/diagram/engine/`), dropping the "poc" naming. Requirements:

- **One symbol source.** Resistor body geometry, lead lengths, dot radius, terminal circles, ground glyph, and all diagram typography (font, sizes, weights) defined once and consumed by every renderer. This is where the owner's typography pass will plug in — make it a tight, obvious surface.
- **Model.** Keep the `NetNode` tree + pure-layout approach (it's tested); add what page migration needs: labels/refs per part (R_TOP, R1…), a way to carry the legacy worker's section trees (`legacy-section-network.ts` already converts worker combos → `Network`; bridge `Network` → `NetNode`), and horizontal orientation where topologies need it.
- **Theming** via CSS variables/currentColor as in the PoC — must look right in light and dark without JS.
- **Keep the existing unit tests** (move/rename `poc-network.test.ts`) and extend as the layout grows. The layout invariants (containment, no-overlap, centring, stub existence) have already caught real bugs.

### 2. Migrate pages, one at a time, parity-gated

Order (from the roadmap, confirmed): **voltage-divider result cards → interactive divider → balanced attenuator → target resistance**. For each page:

- The new engine renders everything the schematic.js version showed (values, Vsupply/Vout labels, section structure), plus per-part hover tooltips (V/I/P) — the whole point of the engine.
- **PNG export keeps working.** `app/src/lib/services/diagram-export.ts` serializes the SVG — CSS-variable colours and external fonts do NOT survive serialization; resolve computed styles to inline attributes (or bake explicit colours) before export. Test the actual downloaded PNG in both themes, don't assume.
- Interactive divider is the hard one: it must replicate the legacy editing UX (tap resistor → edit dialog, insert-series strips, add-parallel, remove, bus tooltips, touch hints — see `interactive-divider.js`). Replicate behaviour first; propose UX improvements separately rather than sneaking them in.
- `schematic.js` stays loadable until the last page migrates; the legacy root site keeps using it forever regardless — do not touch root-site behaviour.
- Per-page done bar: vitest green, svelte-check clean, build green, `npm run smoke` extended to cover the migrated page, side-by-side screenshot vs the old render in light + dark recorded in the PR/commit body, deployed to the test server via `v2`.

### 3. Retire scaffolding

When all four pages are migrated: remove the app's schematic.js adapters (`schematic-browser.ts`, `voltage-divider-diagram.ts` legacy path, `target-network-diagram.svelte` legacy path), update `docs/unified-diagram-roadmap.md` to describe the new engine as current (it still documents the schematic.js era), and turn `/app/diagram-poc` into a small engine gallery page (rename fine) — it's useful as a visual regression surface.

## Decisions to surface to the owner (pause and ask; don't guess)

1. **U-pad Vout reference**: the balanced drawing shows differential Vout across the shunt (`Rmid/(2Rleg+Rmid)`); the search engine's tap ratio is tap-to-ground (`(Rmid+Rleg)/(2Rleg+Rmid)`). Which should the attenuator page report once it's on the new engine?
2. Any interactive-divider UX changes beyond parity.
3. Whether result-card diagrams should default to showing tooltip V/I/P at the card's slider supply (live) — likely yes, but it changes information density; show a screenshot and ask.

## Still gated (do NOT do)

- wt-theme extraction of the density layer — owner said not yet.
- Phase 2/3 features from `docs/overhaul-plan.md` §4 (histogram, zoomable filter, URL params, JLC order codes, new modes) — separate tranche.
- Pushing anywhere other than feature branches and `v2`; no production/domain changes; no credentials exist here.

## Constraints and working practice

- Conventional commits; commit after each completed component — sessions can be cut off without warning.
- Keep `progress.txt` current (session log + resume instructions) and tick `docs/overhaul-plan.md` as engine milestones land.
- Tests verify correctness, they don't define it: no hard-coding to test inputs; flag any test asserting wrong behaviour instead of coding around it.
- End state for this session: at minimum the engine module graduated + voltage-divider cards migrated and deployed to the test server; further pages as time allows, each individually shippable.

## Verification (before calling any part done)

- `node tests/run-tests.js` green; `cd app && npm test && npm run check && npm run build` green; `npm run smoke` green including any newly covered pages.
- Migrated diagrams visually verified in light AND dark on the deployed test server, including a downloaded PNG.
- A fresh-context verifier pass over this brief at the end, outcome recorded in `progress.txt`.
