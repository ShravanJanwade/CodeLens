# CodeLens in one image: the API serves the built web console from the
# same origin. Two stages keep compilers, the browser extension and the
# edge worker out of the image that is pulled on every cold start.

FROM node:22-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

# Copy everything (respects .dockerignore)
COPY . .

# Install the web console and the API with the workspace packages they
# depend on; the extension and the edge worker ship separately.
# Use --no-frozen-lockfile because the lockfile may drift slightly.
RUN corepack pnpm install --no-frozen-lockfile --filter "@codelens/web..." --filter "@codelens/api..."

# Build frontend and API (needs vite, typescript, etc. from devDependencies)
RUN corepack pnpm build

FROM node:22-bookworm-slim

# git: repository analysis clones at runtime. sqlite3: the persistence
# wrapper snapshots the database with SQLite's online backup.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Runtime uses tsx and workspace source packages; do not prune dev dependencies.
COPY --from=build --chown=node:node /app /app

# Create data directories
RUN mkdir -p /data /app/data && chown -R node:node /data /app/data

ENV NODE_ENV=production PORT=4000 DATABASE_URL=/data/codelens.db
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# A pass-through unless PERSIST_DIR is set; see deploy/azure/persist-sqlite.sh.
ENTRYPOINT ["bash", "/app/deploy/azure/persist-sqlite.sh"]
CMD ["node", "scripts/start-production.mjs"]
