# AGENTS.md

## Cursor Cloud specific instructions

This is a static client-side web application (Voltage Divider Resistor Calculator). Legacy calculator pages live at the repo root (`index.html`, `target-resistance.html`, etc.) and stay **build-step-free**: vendored scripts only.

There is also an optional **SvelteKit UI** under the `app/` directory (`paths.base` = `/app`). Run it with `npm install` and `npm run dev` inside `app/` (Node/npm required). It shares legacy logic via adapters (e.g. repo-root `schematic.js`). Deploy legacy at `/` and copy `app/build/` assets under `/app` when serving both together.

The SvelteKit app uses **Tailwind CSS v4** with **`@tailwindcss/vite`**, **`@go2dev/wt-theme@^0.1.2`** from the **public npm registry**, and global imports in `app/src/routes/layout.css` (`tailwindcss` → `theme.css` → `tailwind.theme.css` → `utilities.css`). UI markup prefers **`bg-wt-canvas`**, **`text-wt-body`**, **`border-wt-border`**, **`bg-wt-brand-design`**, etc.; **`app/src/lib/design-tokens.css`** keeps **`--color-*`** / schematic **`--text-color`** for legacy extracted CSS and mirrors **`--wt-*`** in **`[data-theme='dark']`**. Typed tokens: **`app/src/lib/wt-theme-tokens.ts`**. See **`docs/wt-theme-integration-todo.md`** for the integration checklist.

### Running the legacy application

Serve the static files with any HTTP server. The app **cannot** be opened via `file://` due to Web Worker same-origin restrictions.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` for the Voltage Divider page, or `http://localhost:8000/target-resistance.html` for the Target Resistance page.

### Running the framework UI (`app/`)

```bash
cd app && npm install && npm run dev
```

Then open the printed URL (SvelteKit app routes live under `/app/`, e.g. `http://localhost:5173/app/voltage-divider`).

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
