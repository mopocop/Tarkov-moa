# Squad relay — hardened production image.
#
# Build context MUST be the repo root (the relay imports ../../shared/*), e.g.:
#   docker build -f server/deploy/Dockerfile -t squad-relay .
#
# The build stage bundles the TypeScript (relay + shared protocol) into a single
# self-contained .mjs with esbuild, so the runtime image carries NO node_modules,
# NO dev tooling (tsx/typescript/vitest), and NO source — just node + one file.

# ---- build ----
FROM node:22.12-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY shared ./shared
COPY server/src ./server/src
# Bundle everything (incl. ws) into one ESM file. Native builtins stay external
# (platform=node). ws's optional native addons are not bundled — ws runs fine
# in its pure-JS fallback. The createRequire banner lets the bundled CommonJS
# deps (ws) resolve Node builtins under ESM (otherwise `require('events')` throws).
RUN cd server && npx --yes esbuild@0.24.2 src/index.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
      --outfile=/app/relay.mjs

# ---- runtime ----
FROM node:22.12-alpine AS runtime
# tini = proper PID 1 (signal forwarding + zombie reaping) for clean shutdowns.
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/relay.mjs ./relay.mjs
# Feedback JSONL lands here; owned by the unprivileged `node` user so the rest
# of the filesystem can stay read-only.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production \
    PORT=8787 \
    FEEDBACK_FILE=/data/feedback.jsonl
USER node
EXPOSE 8787
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "relay.mjs"]
