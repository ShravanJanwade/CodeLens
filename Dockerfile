FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

# Copy everything (respects .dockerignore)
COPY --chown=node:node . .

# Install ALL dependencies (including devDependencies needed for build).
# Use --no-frozen-lockfile because the lockfile may drift slightly.
RUN corepack pnpm install --no-frozen-lockfile

# Build frontend and API (needs vite, typescript, etc. from devDependencies)
RUN corepack pnpm build

# Create data directories
RUN mkdir -p /data /app/data && chown -R node:node /app /data

# Runtime uses tsx and workspace source packages; do not prune dev dependencies.
ENV NODE_ENV=production PORT=4000 DATABASE_URL=/data/codelens.db
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/start-production.mjs"]
