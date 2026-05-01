# AGENTS.md

## Cursor Cloud specific instructions

This is a static client-side web application (Voltage Divider Resistor Calculator) with no build step, no `package.json`, and no npm dependencies. All libraries are vendored (including SheetJS `vendor/xlsx.full.min.js` for local BOM spreadsheet parsing).

### Running the application

Serve the static files with any HTTP server. The app **cannot** be opened via `file://` due to Web Worker same-origin restrictions.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` for the Voltage Divider page, or `http://localhost:8000/target-resistance.html` for the Target Resistance page.

### Running tests

```bash
node tests/run-tests.js
```

Tests use Node.js built-in `assert` and `vm` modules — no test framework or npm packages needed. Node.js must be installed (any version 12+).

### Linting

There is no linter configured for this project. No ESLint, Prettier, or similar tooling exists.

### Key gotchas

- The `nuis/` directory contains a vendored copy of noUiSlider — do not delete or modify it.
- Font Awesome and `marked.js` are loaded from CDN; they are not required for core calculator functionality.
- Web Workers (`resistor-worker.js`, `target-resistance-worker.js`) handle computation in background threads.
