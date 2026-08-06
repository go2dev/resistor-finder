# Port plan & unified diagramming roadmap

This file captures agreed sequencing for the **framework app** (`app/`, base path `/app`) running **in parallel** with **legacy static pages** at the repo root.

## Overall port plan (unchanged)

1. **Keep** current legacy HTML/JS pages working at repo root.
2. **Framework app** lives under `app/` and is served under **`/app`** (see `app/svelte.config.js` → `paths.base`).
3. Migrate **shell + shared UI state** first: navigation, theme, shared inputs/results containers.
4. Keep **`schematic.js`** as the diagram engine initially; load it via **`$lib/adapters/schematic-browser`** (repo-root script). Replace with a typed facade later if useful.
5. **Migrate one mode at a time**, in this order:
   - Voltage Divider  
   - Interactive Divider  
   - Balanced Attenuator  
   - Target Resistance  
6. **PNG export**: use the framework **`$lib/services/diagram-export`** (`exportSvgToPng`) as the single implementation inside `app/`. Legacy still uses `diagram-export.js` until parity tests pass.
7. After parity: **remove legacy DOM string-render paths** and consolidate export/diagram wiring.

## Unified diagramming system — goal

One coherent way to:

- Mount/clear diagrams per result row  
- Drive PNG export from **structured domain data** (not scraping legacy DOM)  
- Share styling/theming hooks once multiple modes draw schematics  

That “unified system” is a **feature milestone**, not the first milestone.

## Prerequisites (do these before designing the full unified diagram API)

1. **Stable domain outputs per mode**  
   Each route should expose a small explicit shape for “what to draw” (sections, labels, supply/target). Export annotation lines should be derived from that same shape.

2. **Shared diagram host pattern**  
   One predictable mount point and lifecycle in the UI (clear container → render → optional teardown). Implemented incrementally via shared components/helpers under `app/src/lib/components/diagrams/` and `app/src/lib/diagram/`.

3. **Single load path for `schematic.js`**  
   All framework modes should use `ensureSchematicLoaded()` (or a thin wrapper), not one-off script tags inside Svelte routes.

4. **Shell/base-path/theme working**  
   So asset URLs, navigation, and future stroke/colour tokens do not need per-page hacks.

## Safe to defer

- A heavy **abstract Diagram façade** over every `Diagram` method — wait until at least **two** modes (e.g. Voltage Divider + Interactive Divider) share the same host + data patterns.
- **Deleting** legacy `diagram-export.js` or merging it with the TS service — after automated/manual parity checks.

## Suggested sequencing toward “unified diagrams”

1. Finish **Voltage Divider parity** in `app/` (inputs, workers/filters, richer result model as needed).  
2. Port **Interactive Divider** (exercises interactive schematic paths).  
3. Define **narrow typed helpers** (mount, export metadata per mode) where duplication is obvious.  
4. Generalise into a **unified diagram module** only when the helpers stabilize.

## Related paths

| Area | Location |
|------|----------|
| Framework PNG export | `app/src/lib/services/diagram-export.ts` |
| Legacy PNG export (until parity) | `diagram-export.js` |
| Schematic engine | `schematic.js` (repo root) |
| Framework loader | `app/src/lib/adapters/schematic-browser.ts` |
| Divider wiring | `app/src/lib/adapters/voltage-divider-diagram.ts` |
| E-series payload for workers | `app/src/lib/domain/resistor-series-data.json` (regenerate from `resistor-utils.js` if series tables change) |
