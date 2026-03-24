# ─────────────────────────────────────────────────────────────────────────────
# HumanProxy — Project Makefile
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   make setup     — First-time setup (install, build, docker up, migrate)
#   make start     — Start all services (docker compose up)
#   make stop      — Stop all services
#   make update    — Pull latest, rebuild, migrate
#   make validate  — Run lint + format check + build across all packages
#   make test      — Run unit + e2e tests
#   make lint      — Run lint only
#   make logs      — Tail backend logs
#   make clean     — Remove volumes + containers + node_modules
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: setup start stop update validate test lint test-unit test-e2e \
        build logs clean reset db-push db-migrate help

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
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-humanproxy} > /dev/null 2>&1; do \
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
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-humanproxy} > /dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "══ Waiting for MinIO bucket setup ══"
	@docker compose run --rm minio-setup > /dev/null 2>&1 || true
	@echo "══ Running database migrations ══"
	$(MAKE) db-push
	@echo "✅ Update complete!"

# ── Quality ────────────────────────────────────────────────────────────────

validate: ## Run full validation: lint + format check + build
	@echo "══ Lint ══"
	npx turbo lint
	@echo "══ Format check ══"
	npm run format:check
	@echo "══ Build ══"
	npx turbo build
	@echo "✅ Validation passed"

lint: ## Run lint across all packages
	npx turbo lint

test: test-unit test-e2e ## Run all tests (unit + e2e)

test-unit: ## Run unit tests
	@echo "══ Unit tests ══"
	npm test --workspace=@humanproxy/backend

test-e2e: ## Run e2e tests
	@echo "══ E2E tests ══"
	npm run test:e2e --workspace=@humanproxy/backend

# ── Database ───────────────────────────────────────────────────────────────

db-push: ## Push Prisma schema to database (dev/setup)
	docker compose exec -T backend npx prisma db push

db-migrate: ## Run Prisma migrations (production)
	docker compose exec -T backend npx prisma migrate deploy

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
