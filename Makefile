# ─────────────────────────────────────────────────────────────────────────────
# Placet — Project Makefile
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   make setup     — First-time setup (install, build, docker up, migrate)
#   make start     — Start all services (docker compose up)
#   make stop      — Stop all services
#   make update    — Pull latest, rebuild, migrate
#   make validate  — Run lint + format check + build across all packages
#   make test      — Run unit + e2e tests
#   make lint      — Run lint only
#   make inspect-mcp — Launch MCP Inspector to debug the MCP server
#   make export-openapi — Export OpenAPI spec from backend to docs/
#   make docs-dev  — Start Mintlify docs dev server
#   make logs      — Tail backend logs
#   make clean     — Remove volumes + containers + node_modules
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: setup start stop update validate validate-plugin test lint test-unit test-e2e \
        build logs clean reset db-push db-migrate export-openapi docs-dev inspect-mcp help

SHELL := /bin/bash

# ── Help (default target) ──────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Setup & Lifecycle ──────────────────────────────────────────────────────

setup: _check-env ## First-time project setup
	@echo "══ Installing dependencies ══"
	npm ci
	@echo "══ Building packages ══"
	npx turbo build
	@echo "══ Starting Docker services ══"
	docker compose up -d --build
	@echo "══ Waiting for Postgres to be healthy ══"
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-placet} > /dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "══ Waiting for MinIO bucket setup ══"
	@docker compose run --rm minio-setup > /dev/null 2>&1 || true
	@echo "══ Running database migrations ══"
	$(MAKE) db-push
	@echo ""
	@echo "✅ Setup complete!"
	@echo "   Backend:  http://localhost:$${BACKEND_PORT:-3001}"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Swagger:  http://localhost:$${BACKEND_PORT:-3001}/api/docs"
	@echo "   MinIO:    http://localhost:9001"

start: _check-env ## Start all services
	docker compose up -d
	@echo "✅ Services started"

stop: ## Stop all services
	docker compose down
	@echo "✅ Services stopped"

update: _check-env ## Pull latest code, rebuild, and migrate
	@echo "══ Pulling latest changes ══"
	git pull --rebase
	@echo "══ Installing dependencies ══"
	npm ci
	@echo "══ Rebuilding Docker images ══"
	docker compose up -d --build
	@echo "══ Waiting for Postgres to be healthy ══"
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-placet} > /dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "══ Waiting for MinIO bucket setup ══"
	@docker compose run --rm minio-setup > /dev/null 2>&1 || true
	@echo "══ Running database migrations ══"
	$(MAKE) db-push
	@echo "✅ Update complete!"

# ── Quality ────────────────────────────────────────────────────────────────

validate: ## Run full validation: lint + format check + build
	@echo "══ Validating plugins ══"
	npx tsx scripts/validate-plugin.ts
	@echo "══ Lint ══"
	npx turbo lint
	@echo "══ Format check ══"
	npm run format:check
	@echo "══ Build ══"
	npx turbo build
	@echo "✅ Validation passed"

validate-plugin: ## Validate plugin(s): make validate-plugin [PLUGIN=name]
	@if [ -n "$(PLUGIN)" ]; then \
		npx tsx scripts/validate-plugin.ts $(PLUGIN); \
	else \
		npx tsx scripts/validate-plugin.ts; \
	fi

lint: ## Run lint across all packages
	npx turbo lint

test: test-unit test-e2e ## Run all tests (unit + e2e)

test-unit: ## Run unit tests
	@echo "══ Backend unit tests ══"
	npm test --workspace=@placet/backend
	@echo "══ MCP server unit tests ══"
	npm test --workspace=@placet/mcp

test-e2e: ## Run e2e tests
	@echo "══ E2E tests ══"
	npm run test:e2e --workspace=@placet/backend

# ── MCP ────────────────────────────────────────────────────────────────────

inspect-mcp: ## Launch MCP Inspector UI to debug the Placet MCP server (stdio)
	@if [ -z "$$PLACET_API_URL" ] || [ -z "$$PLACET_API_KEY" ]; then \
		echo "Usage: PLACET_API_URL=http://localhost:3001 PLACET_API_KEY=hp_... make inspect-mcp"; \
		echo ""; \
		echo "  Required env vars:"; \
		echo "    PLACET_API_URL   — Backend URL (e.g. http://localhost:3001)"; \
		echo "    PLACET_API_KEY   — API key starting with hp_"; \
		echo "  Optional env vars:"; \
		echo "    PLACET_DEFAULT_CHANNEL — Default channel/agent ID"; \
		exit 1; \
	fi
	npx @modelcontextprotocol/inspector \
		-e PLACET_API_URL=$$PLACET_API_URL \
		-e PLACET_API_KEY=$$PLACET_API_KEY \
		$$([ -n "$$PLACET_DEFAULT_CHANNEL" ] && echo "-e PLACET_DEFAULT_CHANNEL=$$PLACET_DEFAULT_CHANNEL") \
		node packages/mcp-server/dist/index.js --stdio

# ── Database ───────────────────────────────────────────────────────────────

db-push: ## Push Prisma schema to database (dev/setup)
	docker compose run --rm -T backend npx prisma db push

db-migrate: ## Run Prisma migrations (production)
	docker compose run --rm -T backend npx prisma migrate deploy

# ── Docs ───────────────────────────────────────────────────────────────────

BACKEND_URL ?= http://localhost:3001

export-openapi: ## Export OpenAPI spec from running backend to docs/openapi.json
	@echo "══ Fetching OpenAPI spec from $(BACKEND_URL)/api/docs-json ══"
	@curl -sf "$(BACKEND_URL)/api/docs-json" | python3 -m json.tool > docs/openapi.json \
		|| (echo "❌ Backend not reachable at $(BACKEND_URL). Run 'make start' first." && exit 1)
	@python3 scripts/prepare-openapi-for-mintlify.py docs/openapi.json

docs-dev: ## Start Mintlify docs dev server (run export-openapi first)
	cd docs && npx mintlify dev

# ── Utilities ──────────────────────────────────────────────────────────────

logs: ## Tail backend logs
	docker compose logs -f backend

clean: ## Remove containers, volumes, and node_modules
	docker compose down -v
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@echo "✅ Cleaned"

reset: clean setup ## Full reset: clean + setup

# ── Internal ───────────────────────────────────────────────────────────────

_check-env:
	@if [ ! -f .env ]; then \
		echo "⚠️  No .env file found. Creating from .env.example..."; \
		cp .env.example .env; \
		echo "   Please review .env and adjust values if needed."; \
	fi
	@if grep -q '^VAPID_PUBLIC_KEY=$$' .env 2>/dev/null; then \
		echo "══ Generating VAPID keys for push notifications ══"; \
		VAPID_KEYS=$$(npx --yes web-push generate-vapid-keys --json 2>/dev/null); \
		if [ -n "$$VAPID_KEYS" ]; then \
			VAPID_PUB=$$(echo "$$VAPID_KEYS" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(j.publicKey)})"); \
			VAPID_PRV=$$(echo "$$VAPID_KEYS" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(j.privateKey)})"); \
			sed -i.bak "s|^VAPID_PUBLIC_KEY=$$|VAPID_PUBLIC_KEY=$$VAPID_PUB|" .env; \
			sed -i.bak "s|^VAPID_PRIVATE_KEY=$$|VAPID_PRIVATE_KEY=$$VAPID_PRV|" .env; \
			rm -f .env.bak; \
			echo "   VAPID keys generated and written to .env"; \
		else \
			echo "   ⚠️  Could not generate VAPID keys. Push notifications will be disabled."; \
		fi; \
	fi
