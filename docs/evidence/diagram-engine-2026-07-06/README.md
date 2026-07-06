# Diagram-engine tranche — visual evidence (2026-07-06)

Captured during the migrations (headless chromium against local `vite preview`
builds and the deployed v2 test server). Regenerate any of these by driving
the pages per `app/scripts/browser-smoke.mjs`.

| File | What it shows |
|------|---------------|
| `side-by-side-light.png` / `side-by-side-dark.png` | Engine vs legacy schematic.js render of the same 1k/5.1k divider (gallery page), both themes |
| `card-light.png` | Voltage-divider result card on the engine, light |
| `card-dark-tooltip.png` | Same card, dark, per-part V/I/P tooltip open |
| `export-light.png` / `export-dark.png` | Actual downloaded card PNGs from light and dark themes — both ink-on-white, full annotations |
| `interactive-light-default.png` | Interactive divider default 10k/10k state |
| `interactive-dark-edited.png` | Interactive divider after edit + series insert + add-parallel, tooltip open, dark |
| `legacy-interactive-light.png` | Legacy root-site interactive page (same values in results panel) for comparison |
| `atten-card-light.png` | Balanced-attenuator U-pad result card on the engine |
| `atten-lpad-dark.png` | L-pad result card with Z_load box, dark |
| `atten-export-dark.png` | Attenuator card PNG downloaded from dark theme (legacy export path) |
| `target-card-dark.png` | Target-resistance result cards (series stack + parallel group + bracket), dark |
| `target-export-light.png` | Target-resistance downloaded PNG with accent bracket |
| `deployed-gallery-dark.png` | Engine gallery on the deployed test server, dark |
