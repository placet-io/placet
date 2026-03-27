FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies using monorepo root lockfile
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@placet/frontend --workspace=@placet/shared

# Build shared package first, then frontend
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
RUN npm run build --workspace=@placet/shared
COPY apps/frontend/ ./apps/frontend/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@placet/frontend

# Production
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/public ./apps/frontend/public
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/frontend/server.js"]
