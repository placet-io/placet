FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies using monorepo root lockfile
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@humanproxy/backend --workspace=@humanproxy/shared

# Generate Prisma client
FROM deps AS prisma
COPY apps/backend/prisma ./apps/backend/prisma/
COPY apps/backend/prisma.config.ts ./apps/backend/
RUN cd apps/backend && npx prisma generate

# Build shared package first, then backend
FROM prisma AS build
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/plugins/ ./packages/plugins/
RUN npm run build --workspace=@humanproxy/shared
COPY apps/backend/ ./apps/backend/
RUN npm run build --workspace=@humanproxy/backend

# Production – keep monorepo layout so Prisma + workspace symlinks resolve
FROM base AS runner
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/plugins ./packages/plugins
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/prisma.config.ts ./apps/backend/
COPY --from=build /app/apps/backend/docker-entrypoint.sh ./apps/backend/

WORKDIR /app/apps/backend

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["sh", "docker-entrypoint.sh"]
