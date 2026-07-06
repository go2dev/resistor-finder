# Resistor Divider — single static image serving both versions:
#   /     → legacy static app (repo root, no build step)
#   /app  → SvelteKit app (adapter-static build with SPA fallback)
# Built by Dokploy on git push (Application type: Dockerfile).

FROM node:22-alpine AS build
WORKDIR /repo
# App dependencies first for layer caching
COPY app/package.json app/package-lock.json app/
RUN cd app && npm ci
COPY . .
# The app bundles the legacy scripts it needs (resistor-worker.js,
# schematic.js, …) into build/_app/immutable at this step.
RUN cd app && npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Legacy static site at /
COPY --from=build /repo/*.html /repo/*.js /repo/styles.css /repo/README.md /repo/version.json /usr/share/nginx/html/
COPY --from=build /repo/data /usr/share/nginx/html/data
COPY --from=build /repo/nuis /usr/share/nginx/html/nuis
COPY --from=build /repo/vendor /usr/share/nginx/html/vendor

# SvelteKit app under /app (matches kit.paths.base)
COPY --from=build /repo/app/build /usr/share/nginx/html/app

EXPOSE 80
