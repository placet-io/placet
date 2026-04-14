#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────────────────────────
# Placet — All-in-One Entrypoint
# ─────────────────────────────────────────────────────────────────────────────
# Starts nginx (single port), MinIO, backend, frontend and MCP server.
# Supports PostgreSQL and SQLite via DB_PROVIDER env.
# ─────────────────────────────────────────────────────────────────────────────

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f /app/.env ]; then
  echo "[aio] Loading /app/.env"
  set -a
  # shellcheck disable=SC1091
  . /app/.env
  set +a
fi

DB_PROVIDER="${DB_PROVIDER:-sqlite}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-placet}"
MCP_PORT="${MCP_PORT:-3002}"

# Track child PIDs for cleanup
PIDS=""

cleanup() {
  echo "[aio] Shutting down..."
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  wait
  exit 0
}
trap cleanup SIGTERM SIGINT

# ── Generate JWT_SECRET if not set ────────────────────────────────────────────
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change-me-in-production" ]; then
  JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  export JWT_SECRET
  echo "[aio] WARNING: JWT_SECRET was not set — generated a random one."
  echo "[aio]   Sessions will not survive container restarts."
  echo "[aio]   Set JWT_SECRET in your .env for persistent sessions."
fi

# ── 1. Database setup ────────────────────────────────────────────────────────

# Remove prisma.config.ts which requires dotenv (devDep, not in production)
rm -f /app/apps/backend/prisma.config.ts
PRISMA_SCHEMA="/app/apps/backend/prisma/schema.prisma"

if [ "$DB_PROVIDER" = "sqlite" ]; then
  echo "[aio] Database provider: SQLite"

  # Always use the SQLite file path — ignore any DATABASE_URL from host env
  DATABASE_URL="file:/data/db/placet.db"
  export DATABASE_URL

  # Patch Prisma schema to use sqlite provider, then regenerate + push
  sed -i 's/provider = "postgresql"/provider = "sqlite"/' "$PRISMA_SCHEMA"
  cd /app/apps/backend
  /app/node_modules/.bin/prisma generate --schema "$PRISMA_SCHEMA"
  /app/node_modules/.bin/prisma db push --schema "$PRISMA_SCHEMA" --url "$DATABASE_URL"
  cd /app

  echo "[aio] SQLite database ready at ${DATABASE_URL}"
else
  echo "[aio] Database provider: PostgreSQL"

  if [ -z "$DATABASE_URL" ]; then
    echo "[aio] ERROR: DATABASE_URL is required when using PostgreSQL."
    echo "[aio] Set DB_PROVIDER=sqlite for an embedded database."
    exit 1
  fi

  # Wait for PostgreSQL to be reachable
  echo "[aio] Waiting for PostgreSQL..."
  until node -e "
    const net = require('net');
    const url = new URL(process.env.DATABASE_URL.replace('postgresql://', 'http://'));
    const s = net.createConnection(parseInt(url.port) || 5432, url.hostname);
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
  " 2>/dev/null; do
    sleep 1
  done
  echo "[aio] PostgreSQL reachable"

  # Run migrations / push schema
  cd /app/apps/backend
  /app/node_modules/.bin/prisma db push --schema "$PRISMA_SCHEMA" --url "$DATABASE_URL"
  cd /app
fi

# ── 2. Start MinIO ───────────────────────────────────────────────────────────

echo "[aio] Starting MinIO on :${MINIO_PORT}..."
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
minio server /data/minio \
  --address ":${MINIO_PORT}" \
  --console-address ":${MINIO_CONSOLE_PORT}" \
  --quiet &
PIDS="$! $PIDS"

# Wait for MinIO to be ready
echo "[aio] Waiting for MinIO..."
until mc alias set localminio "http://127.0.0.1:${MINIO_PORT}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  sleep 1
done

# Create bucket if it doesn't exist
mc mb --ignore-existing "localminio/${MINIO_BUCKET}" >/dev/null 2>&1
mc anonymous set download "localminio/${MINIO_BUCKET}" >/dev/null 2>&1
echo "[aio] MinIO ready — bucket '${MINIO_BUCKET}' available"

# ── 3. Start Backend ─────────────────────────────────────────────────────────

echo "[aio] Starting backend on :${BACKEND_PORT}..."
export MINIO_ENDPOINT=127.0.0.1
export MINIO_PORT
export MINIO_ACCESS_KEY="$MINIO_ROOT_USER"
export MINIO_SECRET_KEY="$MINIO_ROOT_PASSWORD"
export MINIO_BUCKET

cd /app/apps/backend
node dist/src/main.js &
PIDS="$! $PIDS"
cd /app

# Wait for backend to be healthy
echo "[aio] Waiting for backend..."
until node -e "const h=require('http');h.get('http://127.0.0.1:${BACKEND_PORT}/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; do
  sleep 1
done
echo "[aio] Backend ready"

# ── 4. Start Frontend ────────────────────────────────────────────────────────

echo "[aio] Starting frontend on :3000..."
export INTERNAL_API_URL="http://127.0.0.1:${BACKEND_PORT}"

# In AIO mode, frontend and backend are behind nginx on the same port.
# WS and APP URLs should point to the external URL (default: the nginx port).
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-http://localhost:8080}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:8080}"
export HOSTNAME="0.0.0.0"
cd /app/frontend
node apps/frontend/server.js &
PIDS="$! $PIDS"
cd /app

echo "[aio] Frontend ready"

# ── 5. Start MCP Server ──────────────────────────────────────────────────────

echo "[aio] Starting MCP server on :${MCP_PORT}..."
export PLACET_API_URL="http://127.0.0.1:${BACKEND_PORT}"
export MCP_PORT

cd /app/packages/mcp-server
node dist/index.js &
PIDS="$! $PIDS"
cd /app

echo "[aio] MCP server ready"

# ── 6. Start Nginx (single-port gateway) ─────────────────────────────────────

echo "[aio] Starting nginx on :8080..."
nginx &
PIDS="$! $PIDS"
echo "[aio] Nginx ready"

# ── 7. Wait for any child to exit ────────────────────────────────────────────

echo "[aio] All services started. Waiting..."
wait -n 2>/dev/null || wait
echo "[aio] A service exited — shutting down"
cleanup
