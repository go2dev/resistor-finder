# Phase 3 — BOM-optimisation core (brief, autonomous session)

You're building Phase 3 from `docs/overhaul-plan.md` §4 for the Resistor Divider tool (repo: go2dev/resistor-finder). Phases 0–2 are done and live on the test server: the SvelteKit app under `app/` is at parity with the legacy site, renders every schematic on the Svelte diagram engine, and has the result-set UX tranche (histogram, zoomable filter, deep links, PDF export). This tranche is the one the whole tool is meant to be framed around — **BOM optimisation**: help the user hit a target while leaning on parts they already carry and prefer manufacturable (JLC-basic) values.

## Starting point

- Branch: start from `v2`. **Process: work on a feature branch, merge to `v2` to deploy.** CI builds every push to `v2` (~15–90s once healthy) and hosts it at https://public-sites-resistordividercom-aaqcco-ae7de6-95-216-211-185.sslip.io — **legacy at `/`, the app at `/app/`** (routes: `/app/voltage-divider`, `/app/target-resistance`, `/app/balanced-attenuator`, `/app/interactive-divider`, `/app/docs`, gallery at `/app/diagram-poc`).
- Read first: `progress.txt` (sessions 1–3), `docs/overhaul-plan.md` §4 (Phase 3/4) and §5 (interdependencies), `docs/url-schema.md`, `docs/unified-diagram-roadmap.md`, `AGENTS.md`.
- Baselines before writing code: `node tests/run-tests.js`; `cd app && npm test && npm run check && npm run build`; `cd app && npm run smoke` (34 checks — keep green, extend for every feature).
- Deploy/verify mechanics (SPA shells defeat curl; self-signed cert needs `-k`/`ignoreHTTPSErrors`; kill stray previews with the `pgrep -f "vite [p]review"` bracket trick) are in `progress.txt` and the deploy-and-verify memory. If a deploy fails, check `gh run list --branch v2` before suspecting the repo — the Dokploy pipeline had a server-side outage on 2026-07-07.

## The data you already have

The JLC basics catalog is embedded (`data/jlc_basic_resistors_embedded.json`, mirrored to `app/static/data/`). Each row carries `resistance`, `lcsc` (LCSC order code), `tolerance_fraction`, and package/size fields. `resistor-utils.js` / `$lib/domain/parse-rich-resistors.ts` already parse power codes, tolerance brackets, EIA-96, RKM. The divider ranking comparator (`$lib/domain/voltage-divider.ts` `sortDividerResults`) is deliberately structured to accept another tie-break level (see §5 of the plan) — "prefer JLC basics" plugs in there.

## The work (in order; each item independently shippable)

### 1. JLC precision / order codes (do first — highest value, lowest new surface)

- For any resistor value in a result, surface the **most precise JLC-basic variant** available (check `tolerance_fraction` across catalog rows for that resistance) and its **LCSC order code** (`lcsc`), so the user can order directly.
- Add a ranking preference: **prefer JLC-basic values** as a tie-break in the error-bucket comparator (divider + target modes), *below* the existing correctness ordering — never worse electrical results, just a nudge toward orderable parts within a bucket. Make it a toggle (default on) so it's inspectable.
- Surface it in the result cards and in the PDF export (order codes belong on a BOM sheet). Mostly UI + ranking; no new search machinery.
- Decisions to surface: whether "prefer JLC basics" is on by default; whether to show order codes inline on every card or behind a disclosure; whether worst-case (widest tolerance) or best-available precision is the headline figure.

### 2. Spec-an-existing-divider mode + define-by-ratio mode

- **Spec-a-divider**: given an existing divider (R_top / R_bottom, or a ratio + a rail), find same/close-ratio configurations from the user's parts — a new entry point over the existing combination machinery, not a new solver.
- **Define-by-ratio**: target a ratio directly (not a voltage) — same machinery, different input framing.
- New route(s) under `app/src/routes/`; reuse `legacy-divider-combos.ts` + the worker client. Deep-link them per `docs/url-schema.md` (extend the schema doc).

### 3. Fixed-resistors / vary-input-voltage mode

- Small: given fixed resistors, sweep input voltage and show the output. Shares the per-result supply-slider machinery already on the divider cards.

## Still gated / not this tranche (do NOT do without sign-off)

- **wt-theme extraction** of the density layer (plan §5 candidates) — owner said NOT YET as of 2026-07-06; still a hard gate.
- **Phase 4**: U-pad attenuator polish as its own mode surface; **current-divider mode** (`todo.md`).
- **Phase 5**: conventional-commit history rewrite (outward-facing).
- **Root-site changes** (incl. the known `script.js` attenuator download-button bug — fixed app-side only, root fix awaits owner ok), TLS/cert work, production/domain changes. No credentials here.

## Carried-over owner decisions still awaiting confirmation (from the engine tranche — don't rework unless told)

1. U-pad attenuator page reports **tap-to-ground** Vout (parity); the balanced/differential drawing exists only in the gallery.
2. VD card tooltips show V/I/P at the **live slider supply** (implemented as likely-yes).
3. Attenuator tooltips show the **unloaded** network's V/I/P (differs from the loaded card figures).

## Constraints and working practice (unchanged from phase 2 — it worked)

- Ask the owner the surfaced decisions up front; don't guess.
- Conventional commits, one per completed component (sessions can be cut off without warning). Keep `progress.txt` current; tick `docs/overhaul-plan.md` §4 as items land.
- Every feature: vitest for the pure logic, `npm run smoke` extended to drive the UI, light+dark evidence under `docs/evidence/<tranche>-<date>/`, deployed via `v2` and verified live (screenshots + actual downloaded artifacts where relevant).
- Tests verify correctness, they don't define it: no hard-coding to test inputs; flag any test asserting wrong behaviour.
- Fresh-context verifier pass at the end, outcome recorded in `progress.txt`.

## Verification (before calling any part done)

- `node tests/run-tests.js` green; `cd app && npm test && npm run check && npm run build` green; `npm run smoke` green incl. new UI.
- New UI visually verified light AND dark on the deployed test server; any new export artifacts actually downloaded and opened.
- Order codes spot-checked against the embedded catalog (a surfaced LCSC code must actually correspond to that resistance + tolerance in `jlc_basic_resistors_embedded.json`).
