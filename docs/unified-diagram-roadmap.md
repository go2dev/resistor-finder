# Unified diagramming — current state

Updated 2026-07-06 after the diagram-engine build-out (docs/diagram-engine-brief.md).
Historical sequencing that used to live in this file is preserved at the bottom.

## The engine (current)

All four app pages draw schematics with the **app diagram engine** at
`app/src/lib/diagram/engine/` — Svelte components emitting SVG, no renderer
library (decision record: `docs/overhaul-plan.md` §2).

| Piece | File | Role |
|-------|------|------|
| Symbols & typography | `engine/symbols.ts` | Single source for resistor geometry (46px body, amp 6, 5 teeth, 2px stroke), dots/terminals/ground, and all diagram text styles (inline styles so text survives SVG→PNG serialization). The typography pass plugs in here. |
| Model | `engine/model.ts` | `NetNode` series/parallel trees with optional per-part refs; `networkToNetNode` bridges UI `Network` rows (legacy worker combos arrive via `legacy-section-network.ts`). |
| Layout | `engine/layout.ts` | Pure recursive layout + per-part V/I/P annotation; `layoutCircuit` (vertical rail with junctions), `layoutNetwork` (standalone block), `transposeBlock` (horizontal orientation), bus glyphs for hit-testing. Unit-tested invariants (containment, no-overlap, centring, stubs) in `engine/engine.test.ts`. |
| Parts | `engine/resistor-part.svelte`, `engine/part-tooltip.svelte` | The one place a resistor is drawn (both orientations); shared tooltip. |
| Renderers | `engine/network-schematic.svelte` | Vertical circuit (divider, U/L-pad stacks): supply/tap/ground, caption, `tapVoltage` display override, `tapLoad` (Z_load box), optional interactivity (part click, insert-series strips, bus tooltips). |
| | `engine/network-block-schematic.svelte` | Standalone two-terminal network + measurement bracket (target resistance). |
| | `engine/upad-schematic.svelte` | Balanced U-pad (horizontal legs, vertical shunt). |

### Per-page wiring

- **Voltage divider** — `components/diagrams/divider-schematic.svelte` renders result cards; PNG export via `services/diagram-export.ts` (`inkColor` resolves currentColor for both themes; canvas widens to fit annotation lines).
- **Interactive divider** — native Svelte page on the engine's interactive props; tree state + edit ops in `domain/interactive-divider.ts`. Only the legacy `ResistorUtils` parser is still loaded (input notation parity).
- **Balanced attenuator** — page is still legacy-injected (script.js computes), but `adapters/engine-result-diagram.ts` overrides the `renderResultDiagram` global so result schematics are engine mounts (U-pad stack, L-pad with Z_load). schematic.js is no longer loaded anywhere in the app.
- **Target resistance** — `components/diagrams/target-network-diagram.svelte` converts `ComboNode` trees and renders `NetworkBlockSchematic`.

### PNG export rules

Engine SVGs draw with `currentColor` + inline text styles. Serialization
loses app CSS, so exports either pass `inkColor` (app export service) or rely
on currentColor defaulting to black (legacy diagram-export.js path on the
attenuator page). Accent-coloured elements use inline `var(--…, fallback)`
styles so a fallback colour survives standalone rendering. Always verify the
actual downloaded PNG in both themes.

### Gallery / visual regression

`/app/diagram-poc` (unlinked route) exercises every renderer — check it after
touching symbols or layout. `cd app && npm run smoke` drives all four pages
including tooltips and real PNG downloads.

## Legacy root site

The root static pages (`index.html`, `interactive-divider.html`, …) keep
using repo-root `schematic.js` + `diagram-export.js` indefinitely — do not
migrate or restyle them. Known root-site bug flagged 2026-07-06: the
attenuator result download button has a broken inline onclick
(JSON.stringify'd kind terminates the HTML attribute); fixed app-side only.

## Historical port plan (completed)

The original sequencing: shell first; keep `schematic.js` via
`$lib/adapters/schematic-browser` while migrating modes one at a time
(Voltage Divider → Interactive Divider → Balanced Attenuator → Target
Resistance); then consolidate export and remove legacy adapters. All steps
completed 2026-07-06; the schematic.js adapters
(`schematic-browser.ts`, `voltage-divider-diagram.ts`,
`interactive-divider-browser.ts`) have been removed from the app.
