# @go2dev/wt-theme — integrated baseline

## Done in `app/`

- **npm**: `@go2dev/wt-theme@^0.1.2` from **https://registry.npmjs.org** (no GitHub Packages). Removed `@go2dev` registry entries from `app/.npmrc`.
- **Tailwind v4**: `@tailwindcss/vite` + `tailwindcss` ^4.x; **`postcss.config.cjs`** and legacy **`tailwind.config.cjs`** removed (CSS-first pipeline via Vite).
- **Global CSS** (`app/src/routes/layout.css`), order:

  ```css
  @import 'tailwindcss';
  @import '@go2dev/wt-theme/theme.css';
  @import '@go2dev/wt-theme/tailwind.theme.css';
  @import '@go2dev/wt-theme/utilities.css';
  ```

  Plus **`@custom-variant dark`** for `[data-theme='dark']` (existing shell toggle).

- **`design-tokens.css`**: compatibility shim mapping **`--color-*`** / schematic **`--text-color`** / legacy **`--input-*`** from **`--wt-*`** in light mode; dark mode overrides remain local until wt-theme ships dark tokens.

## Optional next passes

- [ ] Replace more arbitrary `[var(--color-*)]` classes with **`bg-wt-canvas`**, **`text-wt-body`**, **`rounded-wt-box`**, etc., where it simplifies markup.
- [ ] Hero/squircle: apply **`utilities.css`** classes (**`.wt-corner-squircle`**, `.wt-revamp-hero-*`) where layouts benefit (ancestor **`[container-type:inline-size]`** for scaled hero tagline).
- [ ] **TypeScript**: `import tokens from '@go2dev/wt-theme/tokens.json'` — **`resolveJsonModule`** is already enabled in `app/tsconfig.json`.

## Bump workflow

Consumers bump semver only; do not edit generated CSS under `node_modules`. Canonical edits live in **go2dev/whatever-together** (`packages/wt-theme`, `npm run theme:sync`).
