.PHONY: up down build rebuild logs migrate shell-db fresh help

## Start all services in the background
up:
	docker compose up -d

## Stop all services
down:
	docker compose down

## Build all Docker images
build:
	docker compose build

## Rebuild all images from scratch (no cache)
rebuild:
	docker compose build --no-cache

## Follow logs from all services (Ctrl-C to stop)
logs:
	docker compose logs -f

## Run pending database migrations (one-shot)
migrate:
	docker compose run --rm migrate

## Open a psql shell in the database container
shell-db:
	docker compose exec db psql -U drawapp -d drawapp

## Tear everything down, wipe volumes, then rebuild and start fresh
fresh: down
	docker compose down -v
	docker compose up -d --build

## Show available commands
help:
	@grep -E '^##' Makefile | sed 's/## /  /'
