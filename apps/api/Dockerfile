# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# --- deps: install the full workspace so apps/api can resolve @voiceplatform/* ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile

# --- build: tsc the api workspace ---
FROM base AS build
COPY --from=deps /repo /repo
COPY apps/api ./apps/api
RUN pnpm --filter @voiceplatform/api build

# --- run: prod-only deps, dist only ---
FROM base AS run
ENV NODE_ENV=production
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /repo/apps/api/dist ./apps/api/dist
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/server.js"]
