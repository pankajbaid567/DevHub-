# syntax=docker/dockerfile:1.7
# Sandboxed code runner. Isolation layers:
#   1. this image: only node + python, runs as an unprivileged user;
#   2. docker-compose: no network egress, read-only rootfs, cap_drop ALL, no-new-privileges,
#      memory / CPU / pids limits, small noexec tmpfs;
#   3. per run (src/sandbox.ts): scrubbed env, temp dir, ulimits, wall-clock kill of the
#      process group, output caps.
# For untrusted public traffic add a 4th layer: run this container with gVisor (runtime: runsc).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/runner/package.json apps/runner/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace @devhub/runner --include-workspace-root=false
COPY apps/runner apps/runner
RUN npm run build -w @devhub/runner

FROM node:22-alpine AS runtime
RUN apk add --no-cache python3 g++ && rm -rf /usr/lib/python3*/ensurepip /usr/lib/python3*/idlelib
ENV NODE_ENV=production PORT=2000
WORKDIR /srv
COPY --from=build /app/apps/runner/package.json ./package.json
COPY --from=build /app/apps/runner/dist ./dist
USER node
EXPOSE 2000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:2000/health || exit 1
CMD ["node", "dist/main.js"]
