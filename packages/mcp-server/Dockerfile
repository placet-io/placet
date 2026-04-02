FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies using monorepo root lockfile
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN npm ci --workspace=@placet/mcp

# Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/mcp-server/ ./packages/mcp-server/
RUN npm run build --workspace=@placet/mcp

# Production
FROM base AS runner
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=build /app/packages/mcp-server/package.json ./packages/mcp-server/

WORKDIR /app/packages/mcp-server

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "dist/index.js"]
