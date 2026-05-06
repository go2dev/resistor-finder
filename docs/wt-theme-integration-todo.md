# @go2dev/wt-theme — integrated baseline

## Done in `app/`

- **npm**: `@go2dev/wt-theme@^0.1.2` from **https://registry.npmjs.org** (no GitHub Packages). Removed `@go2dev` registry entries from `app/.npmrc`.
- **Tailwind v4**: `@tailwindcss/vite` + `tailwindcss` ^4.x; CSS-first pipeline via Vite (no legacy Tailwind v3 PostCSS config).
- **Global CSS** (`app/src/routes/layout.css`), order:

  ```css
  @import 'tailwindcss';
  @import '@go2dev/wt-theme/theme.css';
  @import '@go2dev/wt-theme/tailwind.theme.css';
  @import '@go2dev/wt-theme/utilities.css';
  ```

  Plus **`@custom-variant dark`** for `[data-theme='dark']`, **`@theme inline`** for **`wt-muted` / `wt-muted-fg` / `wt-border`** (semantic muted + borders track `--wt-*` + dark overrides).

- **`design-tokens.css`**: Legacy **`--color-*`**, **`--text-color`**, **`--input-*`** for schematic/calculator CSS still resolve through **`--wt-*`**. **`[data-theme='dark']`** mirrors **`--wt-color-*`** so **`bg-wt-canvas`**, **`text-wt-body`**, **`bg-wt-brand-design`**, etc. match the dark palette.
- **UI**: Routes and components use **`bg-wt-*` / `text-wt-*` / `border-wt-*`** utilities; **`wt-corner-squircle`** on main shell + results table wrapper; header uses **`@container`** + **`.wt-revamp-hero-title`** / **`.wt-revamp-hero-tagline`** for scaled typography.
- **Tokens**: **`app/src/lib/wt-theme-tokens.ts`** re-exports **`@go2dev/wt-theme/tokens.json`** (used for shell subtitle version line).

## Bump workflow

Consumers bump semver only; do not edit generated CSS under `node_modules`. Canonical edits live in **go2dev/whatever-together** (`packages/wt-theme`, `npm run theme:sync`).
