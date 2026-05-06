# @go2dev/wt-theme integration — TODO / implementation notes

## Current status (repo)

| Item | State |
|------|--------|
| GitHub Packages scope in `app/.npmrc` | Done (`@go2dev` → `npm.pkg.github.com`, token via `${NODE_AUTH_TOKEN}`). |
| `package.json` dependency | `@go2dev/wt-theme` declared at `^0.1.0`. |
| `npm install` / lockfile | **Blocked** until a machine or CI sets `NODE_AUTH_TOKEN` (PAT with `read:packages`, plus `repo` if the package is private). Until then, `cd app && npm install` will **401** on `@go2dev/wt-theme`. **Escape hatch for local work without the package:** temporarily remove the `@go2dev/wt-theme` line from `app/package.json`, run `npm install`, then restore the line when you have a token (and run install again to refresh the lockfile). |
| CSS wired into `app/src/routes/layout.css` | **Not done** — waiting on successful install + Tailwind upgrade decision (below). |
| Tailwind | App is on **Tailwind v3** (`tailwindcss` ^3.4.x). The theme ships **`tailwind.theme.css`** using Tailwind **v4** `@theme inline` — full utility parity (`bg-wt-*`, etc.) needs **v4** (see Vite + SvelteKit Tailwind v4 docs). |

## Install (local)

```bash
export NODE_AUTH_TOKEN=ghp_xxx   # PAT with read:packages
cd app && npm install
```

Or put `//npm.pkg.github.com/:_authToken=ghp_xxx` in `~/.npmrc` (never commit raw tokens).

## CI

Use `actions/setup-node` with `registry-url: https://npm.pkg.github.com` and `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` where org policy allows, or a stored PAT secret.

## Wire CSS (after install + Tailwind v4)

Target global stylesheet: `app/src/routes/layout.css` (this project’s equivalent of `globals.css`).

**Required order** (from theme docs):

1. Tailwind entry (v4: `@import "tailwindcss";` or project-standard entry — confirm against `@go2dev/wt-theme` release notes).
2. `@go2dev/wt-theme/theme.css` — `:root` semantic `--wt-*` variables.
3. `@go2dev/wt-theme/tailwind.theme.css` — maps `--wt-*` into Tailwind `@theme` utilities.
4. `@go2dev/wt-theme/utilities.css` — `@layer utilities` helpers (squircle, hero classes; hero tagline scaling needs ancestor `[container-type:inline-size]`).

**Conflict planning:** `app/src/lib/design-tokens.css` defines `--color-*`, `--radius-*`, etc. Either:

- Gradually **replace** component usage with `wt-*` utilities / `--wt-*` vars, or  
- **Bridge** during migration (e.g. map a few `--color-*` aliases from `--wt-*` in one place).

Do **not** edit generated CSS inside `node_modules/@go2dev/wt-theme` — bump the package version when maintainers publish.

## Optional: `tokens.json` in TypeScript

```ts
import tokens from '@go2dev/wt-theme/tokens.json';
```

Requires `"resolveJsonModule": true` in `app/tsconfig.json` (verify `extends` / compilerOptions).

## Reference implementation

`go2dev/whatever-together`: `src/app/globals.css`, `src/lib/revamp-theme-tokens.ts`, `src/components/ui/wt-shell.tsx`, `src/components/ui/wt-pill-button.tsx`.

Optional runtime “revamp” pattern: set `--revamp-canvas-bg`, `--revamp-surface-bg`, `--revamp-accent` on a layout root and use `bg-[color:var(--revamp-canvas-bg)]` etc. Pill motion: `--pill-bg`, `--pill-shadow-rest`, `--pill-shadow-active`, `--pill-px`, `--pill-py` with `bg-[color:var(--pill-bg)]` (see `wtRevampPillStyle` / `WT_REVAMP_PILL_MOTION_CLASSNAME` there).

## Checklist before closing this TODO

- [ ] Authenticated `npm install` updates `app/package-lock.json` with `@go2dev/wt-theme`.
- [ ] Upgrade app toolchain to **Tailwind v4** (or document hybrid if theme adds a v3-compatible export later).
- [ ] Import theme CSS in correct order in `layout.css`; remove or reconcile `design-tokens.css`.
- [ ] Sweep routes/components for `bg-[var(--color-*)]` → `bg-wt-*` (or explicit bridge).
- [ ] Enable `resolveJsonModule` if using `tokens.json`.
- [ ] CI: `NODE_AUTH_TOKEN` / registry-url for install step.
