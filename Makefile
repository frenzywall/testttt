# Simple deployment Makefile

SHELL := /bin/sh

# Paths
ROOT_COMPOSE := docker-compose.yml
CLOUDFLARE_DIR := cloudfared
CLOUDFLARE_COMPOSE := $(CLOUDFLARE_DIR)/docker-compose.yml

# Default target
.PHONY: help
help:
	@echo "Targets:"
	@echo "  make deploy         - Start app using $(ROOT_COMPOSE)"
	@echo "  make deploy-cloud   - Start app + cloud tunnel using both compose files"
	@echo "  make down           - Stop app stack"
	@echo "  make down-cloud     - Stop app + cloud tunnel stacks"
	@echo "  make logs           - Tail app logs"
	@echo "  make logs-cloud     - Tail app + cloud tunnel logs"

.PHONY: deploy
deploy:
	docker compose -f $(ROOT_COMPOSE) up -d --remove-orphans

.PHONY: deploy-cloud
deploy-cloud:
	@if [ ! -f .env ]; then \
		echo ".env not found. Creating one now..."; \
		read -p "Enter Cloudflare TUNNEL_TOKEN: " TUNNEL_TOKEN; \
		echo "TUNNEL_TOKEN=$$TUNNEL_TOKEN" > .env; \
		echo "Created .env"; \
	else \
		if ! grep -q '^TUNNEL_TOKEN=' .env; then \
			read -p "Enter Cloudflare TUNNEL_TOKEN: " TUNNEL_TOKEN; \
			printf "\nTUNNEL_TOKEN=%s\n" "$$TUNNEL_TOKEN" >> .env; \
			echo "Added TUNNEL_TOKEN to .env"; \
		elif [ -z "$$((grep '^TUNNEL_TOKEN=' .env || true) | cut -d= -f2-)" ]; then \
			read -p "Enter Cloudflare TUNNEL_TOKEN: " TUNNEL_TOKEN; \
			sed -i.bak "s/^TUNNEL_TOKEN=.*/TUNNEL_TOKEN=$$TUNNEL_TOKEN/" .env; rm -f .env.bak; \
			echo "Updated TUNNEL_TOKEN in .env"; \
		fi; \
	fi; \
	docker compose -f $(ROOT_COMPOSE) -f $(CLOUDFLARE_COMPOSE) up -d --remove-orphans

.PHONY: down
down:
	docker compose -f $(ROOT_COMPOSE) down --remove-orphans

.PHONY: down-cloud
down-cloud:
	docker compose -f $(ROOT_COMPOSE) -f $(CLOUDFLARE_COMPOSE) down --remove-orphans

.PHONY: logs
logs:
	docker compose -f $(ROOT_COMPOSE) logs -f --tail=200

.PHONY: logs-cloud
logs-cloud:
	docker compose -f $(ROOT_COMPOSE) -f $(CLOUDFLARE_COMPOSE) logs -f --tail=200


