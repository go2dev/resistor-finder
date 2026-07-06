# Deploy runbook — Dokploy (git-push auto-deploy)

## Decisions

- **Adapter: `@sveltejs/adapter-static`** (already configured, `app/svelte.config.js`). The entire product is client-side — Web Workers, no server endpoints, no SSR data needs — so a Node runtime (`adapter-node`) would only add an idle process to patch and monitor. Static output also lets one image serve the legacy site and the new app together.
- **Base path: `/app`** (unchanged, `kit.paths.base`). Legacy stays at `/` during the migration; both ship in one image. See "Domain cutover" below for the flip.
- **Build method: Dockerfile, not Nixpacks.** Nixpacks would auto-detect a Node app and produce a `npm start` server; this repo is a hybrid (no-build legacy static root + a SvelteKit build) that maps cleanly to a two-stage Dockerfile ending in nginx. The Dockerfile is the canonical build recipe; Dokploy's "Dockerfile" application type uses it as-is.

## What's in the image

`Dockerfile` (repo root) + `deploy/nginx.conf`:

1. Stage 1 (`node:22-alpine`): `npm ci` + `npm run build` inside `app/`. The app bundles every legacy script it consumes (`resistor-worker.js`, `schematic.js`, …) into `build/_app/immutable/`, so the `/app` build is self-contained.
2. Stage 2 (`nginx:1.27-alpine`):
   - legacy site → `/usr/share/nginx/html` (root `*.html`, `*.js`, `styles.css`, `README.md` — fetched by `readme.html` —, `version.json`, `data/`, `nuis/`, `vendor/`)
   - app build → `/usr/share/nginx/html/app`
   - nginx: SPA fallback for `/app/*` → `/app/index.html` (adapter-static runs in fallback mode, routes aren't prerendered), immutable caching for `/app/_app/immutable/`, `no-store` for `version.json`.

Local verification:

```bash
docker build -t resistor-finder:test .
docker run --rm -p 8080:80 resistor-finder:test
# http://localhost:8080/            → legacy voltage divider
# http://localhost:8080/app/        → SvelteKit app (and deep links, e.g. /app/target-resistance)
```

> Status: the authoring environment could not run Docker (nested sandbox, no
> bind mounts), so the image itself has not been built yet. The exact file
> layout the Dockerfile produces was replicated on disk and every path smoke-
> tested over HTTP (legacy pages, app shell + immutable assets, data/, nuis/,
> vendor/, version.json). **Run the docker build + curl checks above on a
> Docker-capable machine before the first Dokploy deploy.**

## Dokploy service configuration

Dokploy is not publicly reachable from this environment yet; configure via its UI when access lands. No credentials are stored in this repo — the GitHub connection is made in Dokploy itself.

- **Type:** Application
- **Provider:** GitHub → `go2dev/resistor-finder`
- **Branch:** the production branch (decide at cutover; currently the integration branch is `cursor/sveltekit-greenfield-foundation-8189`)
- **Auto Deploy:** ON (deploy on push — this is the trigger; pushing to the tracked branch IS the deploy)
- **Build Type:** Dockerfile · path `./Dockerfile` · context `.`
- **Port:** 80 (map the domain to container port 80)
- **Domain:** `resistordivider.com` (+ `www` redirect), HTTPS via Dokploy/Traefik Let's Encrypt
- **Health check (optional):** `GET /version.json` expecting 200
- **Env vars:** none required (fully static)

## Release procedure

1. Merge to the tracked branch locally; ensure green: `node tests/run-tests.js` and `cd app && npm test && npm run check && npm run build`, plus the headless-browser smoke over the built app: `cd app && npm run smoke` (needs `npx playwright install chromium` once).
2. Optional: `docker build .` locally for a final smoke test.
3. Update `version.json` (root **and** `app/static/version.json` — keep in sync until a build step stamps them).
4. `git push` the tracked branch → Dokploy builds the Dockerfile and swaps the container. Rollback = Dokploy "Deployments" → redeploy a previous build, or `git revert` + push.

## Domain cutover (later, separate sign-off)

When the new app replaces legacy at the root:

1. `app/svelte.config.js`: `paths.base` → `''`.
2. `deploy/nginx.conf`: serve the app build at `/` with root SPA fallback; keep legacy pages under `/legacy/` (or drop them) and add 301s for the old entry points (`/target-resistance.html` → `/target-resistance`, etc.).
3. `Dockerfile`: copy `app/build` to the web root instead of `/app`.
4. Push → auto-deploy. DNS does not change (same service, same domain).
