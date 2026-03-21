FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies using monorepo root lockfile
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=@humanproxy/backend

# Generate Prisma client
FROM deps AS prisma
COPY apps/backend/prisma ./apps/backend/prisma/
COPY apps/backend/prisma.config.ts ./apps/backend/
RUN cd apps/backend && npx prisma generate

# Build
FROM prisma AS build
COPY apps/backend/ ./apps/backend/
RUN npm run build --workspace=@humanproxy/backend

# Production
FROM base AS runner
ENV NODE_ENV=production

COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/package.json ./
COPY --from=build /app/apps/backend/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/src/main.js"]
