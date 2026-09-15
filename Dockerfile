FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app
COPY --chown=node:node . .
RUN corepack pnpm install --frozen-lockfile && corepack pnpm build \
    && mkdir -p /data /app/data && chown -R node:node /app /data
# Runtime uses tsx and workspace source packages; do not prune dev dependencies.
ENV NODE_ENV=production PORT=4000 DATABASE_URL=/data/codelens.db
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
