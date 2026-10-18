# Base pinned by major tag; pinning by digest is a future hardening step.
FROM node:24-slim AS deps
WORKDIR /app
# Manifests first so this layer is rebuilt only when dependencies change.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node agent-home ./agent-home
# Created and chowned before VOLUME/mounts so a new named volume inherits node ownership.
# Missing data files are read as empty, so a fresh volume needs no seeding.
RUN mkdir -p agent-home/memory && chown node:node agent-home/memory
VOLUME /app/agent-home/memory

USER node
EXPOSE 3000
# Compose (or `docker run -e`) must set HOST=0.0.0.0 and ALLOW_PUBLIC_BIND=true to be reachable from outside the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Exec form, no npm wrapper: SIGTERM goes straight to node.
CMD ["node", "server.js"]
