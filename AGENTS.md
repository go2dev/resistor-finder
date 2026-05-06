# AGENTS.md

## Cursor Cloud specific instructions

This is a static client-side web application (Voltage Divider Resistor Calculator). Legacy calculator pages live at the repo root (`index.html`, `target-resistance.html`, etc.) and stay **build-step-free**: vendored scripts only.

There is also an optional **SvelteKit UI** under the `app/` directory (`paths.base` = `/app`). Run it with `npm install` and `npm run dev` inside `app/` (Node/npm required). It shares legacy logic via adapters (e.g. repo-root `schematic.js`). Deploy legacy at `/` and copy `app/build/` assets under `/app` when serving both together.

The app declares **`@go2dev/wt-theme`** (Whatever Together design tokens) from **GitHub Packages**. `app/.npmrc` scopes `@go2dev` to `https://npm.pkg.github.com` and uses `${NODE_AUTH_TOKEN}`. **npm installs from GitHub Packages still require a token even if the package is public** — set `NODE_AUTH_TOKEN` (PAT with `read:packages` or CI `GITHUB_TOKEN` where allowed). Integration steps (Tailwind v4, CSS import order, replacing `design-tokens.css`) are in **`docs/wt-theme-integration-todo.md`**.

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
