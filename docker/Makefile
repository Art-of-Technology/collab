# Collab Docker Environment Management
# Usage: make [command]

.PHONY: help setup clean
.PHONY: dev dev-build dev-down dev-restart dev-logs dev-status dev-shell dev-first-run
.PHONY: uat uat-build uat-down uat-restart uat-logs uat-status uat-shell uat-first-run
.PHONY: prod prod-build prod-down prod-restart prod-logs prod-status prod-shell prod-first-run prod-admin
.PHONY: dev-db-migrate dev-db-seed dev-db-backup dev-db-restore dev-db-reset
.PHONY: uat-db-migrate uat-db-backup uat-db-restore uat-db-reset
.PHONY: prod-db-migrate prod-db-backup prod-db-restore prod-db-reset

# Default target
help: ## Show this help message
	@echo "Collab Docker Environment Commands:"
	@echo ""
	@echo "🔧 Setup & Configuration:"
	@grep -E '^[a-zA-Z_-]*setup[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🚀 Development Environment:"
	@grep -E '^[a-zA-Z_-]*dev[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[32m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🧪 UAT Environment:"
	@grep -E '^[a-zA-Z_-]*uat[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[33m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🔒 Production Environment:"
	@grep -E '^[a-zA-Z_-]*prod[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[31m%-25s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "🧹 Maintenance:"
	@grep -E '^[a-zA-Z_-]*clean[a-zA-Z_-]*:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[35m%-25s\033[0m %s\n", $$1, $$2}'

# ============================================================================
# SETUP COMMANDS
# ============================================================================

setup: ## Initial setup - copy environment templates and generate secrets
	@echo "🔧 Setting up Collab Docker environments..."
	@mkdir -p dev uat prod shared
	@if [ ! -f dev/.env.dev.local ]; then \
		cp dev/.env.dev.template dev/.env.dev.local; \
		echo "📋 Created dev/.env.dev.local from template"; \
	else \
		echo "⚠️  dev/.env.dev.local already exists"; \
	fi
	@if [ ! -f uat/.env.uat.local ]; then \
		cp uat/.env.uat.template uat/.env.uat.local; \
		echo "📋 Created uat/.env.uat.local from template"; \
	else \
		echo "⚠️  uat/.env.uat.local already exists"; \
	fi
	@if [ ! -f prod/.env.prod.local ]; then \
		cp prod/.env.prod.template prod/.env.prod.local; \
		echo "📋 Created prod/.env.prod.local from template"; \
	else \
		echo "⚠️  prod/.env.prod.local already exists"; \
	fi
	@echo ""
	@echo "✅ Setup complete! Please edit environment files with your credentials:"
	@echo "📝 Development: docker/dev/.env.dev.local"
	@echo "📝 UAT: docker/uat/.env.uat.local"
	@echo "📝 Production: docker/prod/.env.prod.local"

# ============================================================================
# DEVELOPMENT ENVIRONMENT
# ============================================================================

dev-build: ## Build development images
	@echo "🏗️  Building Collab development images..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local build

dev: dev-build ## Start development environment with hot-reload
	@echo "🚀 Starting Collab development environment..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local up -d
	@echo "✅ Development services started!"
	@echo "🏢 Collab: http://localhost:3000"
	@echo "🗄️  pgAdmin: http://localhost:5050 (dev@collab.local / devpassword)"
	@echo "📧 MailHog: http://localhost:8025"
	@echo "📊 Redis Commander: http://localhost:8081"

dev-down: ## Stop development environment
	@echo "🛑 Stopping development services..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local down
	@echo "✅ Development services stopped"

dev-restart: ## Restart development environment
	@echo "🔄 Restarting development services..."
	$(MAKE) dev-down
	$(MAKE) dev

dev-logs: ## View development logs
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local logs -f

dev-status: ## Check development service status
	@echo "📊 Development Service Status:"
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local ps

dev-shell: ## Access development application shell
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local exec collab-dev sh

dev-first-run: setup dev ## Complete development setup and start
	@echo ""
	@echo "🎉 Collab development environment is ready!"
	@echo "🏢 Access Collab at: http://localhost:3000"
	@echo "🔧 Development tools available - check console output above"

# Development Database Operations (External NeonDB)
dev-db-migrate: ## Run database migrations in development (external NeonDB)
	@echo "🔄 Running development database migrations on external NeonDB..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local exec collab-dev npx prisma migrate deploy

dev-db-seed: ## Seed development database (external NeonDB)
	@echo "🌱 Seeding external development database..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local exec collab-dev npm run prisma:init-workspace

dev-db-reset: ## Reset development database using Prisma (⚠️ DESTRUCTIVE - affects external NeonDB)
	@echo "⚠️  WARNING: This will reset your external NeonDB development database!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local exec collab-dev npx prisma migrate reset --force

dev-db-studio: ## Open Prisma Studio for development database
	@echo "🔍 Opening Prisma Studio for development database..."
	cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local exec collab-dev npx prisma studio

# ============================================================================
# UAT ENVIRONMENT
# ============================================================================

uat-build: ## Build UAT images
	@echo "🏗️  Building Collab UAT images..."
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local build

uat: uat-build ## Start UAT environment
	@echo "🚀 Starting Collab UAT environment..."
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local up -d
	@echo "✅ UAT services started!"
	@echo "🏢 Collab: http://localhost:3001"
	@echo "🗄️  pgAdmin: http://localhost:5051 (uat@collab.local / uatpassword)"
	@echo "📊 Redis Commander: http://localhost:8082"

uat-down: ## Stop UAT environment
	@echo "🛑 Stopping UAT services..."
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local down
	@echo "✅ UAT services stopped"

uat-restart: ## Restart UAT environment
	@echo "🔄 Restarting UAT services..."
	$(MAKE) uat-down
	$(MAKE) uat

uat-logs: ## View UAT logs
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local logs -f

uat-status: ## Check UAT service status
	@echo "📊 UAT Service Status:"
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local ps

uat-shell: ## Access UAT application shell
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local exec collab-uat sh

uat-first-run: setup uat ## Complete UAT setup and start
	@echo ""
	@echo "🎉 Collab UAT environment is ready!"
	@echo "🏢 Access Collab UAT at: http://localhost:3001"

# UAT Database Operations (External AWS RDS or similar)
uat-db-migrate: ## Run database migrations in UAT (external database)
	@echo "🔄 Running UAT database migrations on external database..."
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local exec collab-uat npx prisma migrate deploy

uat-db-reset: ## Reset UAT database using Prisma (⚠️ DESTRUCTIVE - affects external database)
	@echo "⚠️  WARNING: This will reset your external UAT database!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local exec collab-uat npx prisma migrate reset --force

uat-db-studio: ## Open Prisma Studio for UAT database
	@echo "🔍 Opening Prisma Studio for UAT database..."
	cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local exec collab-uat npx prisma studio

# ============================================================================
# PRODUCTION ENVIRONMENT
# ============================================================================

prod-build: ## Build production images
	@echo "🏗️  Building Collab production images..."
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local build

prod: prod-build ## Start production environment
	@echo "🚀 Starting Collab production environment..."
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local up -d
	@echo "✅ Production services started!"
	@echo "🏢 Collab: http://localhost:3002"

prod-admin: prod-build ## Start production environment with admin tools
	@echo "🚀 Starting Collab production with admin tools..."
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local --profile admin up -d
	@echo "✅ Production services with admin tools started!"
	@echo "🏢 Collab: http://localhost:3002"
	@echo "🗄️  pgAdmin: http://localhost:5052"
	@echo "📊 Redis Commander: http://localhost:8083"

prod-down: ## Stop production environment
	@echo "🛑 Stopping production services..."
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local down
	@echo "✅ Production services stopped"

prod-restart: ## Restart production environment
	@echo "🔄 Restarting production services..."
	$(MAKE) prod-down
	$(MAKE) prod

prod-logs: ## View production logs
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local logs -f

prod-status: ## Check production service status
	@echo "📊 Production Service Status:"
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local ps

prod-shell: ## Access production application shell
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local exec collab-prod sh

prod-first-run: setup prod ## Complete production setup and start
	@echo ""
	@echo "🎉 Collab production environment is ready!"
	@echo "🏢 Access Collab at: http://localhost:3002"
	@echo "🔒 Production environment - ensure SSL is configured for public deployment"

# Production Database Operations (External AWS RDS)
prod-db-migrate: ## Run database migrations in production (external AWS RDS)
	@echo "🔄 Running production database migrations on external AWS RDS..."
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local exec collab-prod npx prisma migrate deploy

prod-db-reset: ## Reset production database using Prisma (⚠️ EXTREMELY DESTRUCTIVE - affects external AWS RDS)
	@echo "⚠️  DANGER: This will reset your external AWS RDS production database!"
	@echo "This action cannot be undone and affects your live production data!"
	@read -p "Type 'DELETE_ALL_PRODUCTION_DATA' to continue: " confirm && [ "$$confirm" = "DELETE_ALL_PRODUCTION_DATA" ] || exit 1
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local exec collab-prod npx prisma migrate reset --force

prod-db-studio: ## Open Prisma Studio for production database (⚠️ USE WITH CAUTION)
	@echo "🔍 Opening Prisma Studio for production database..."
	@echo "⚠️  WARNING: You are accessing the live production database!"
	cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local exec collab-prod npx prisma studio

# ============================================================================
# MAINTENANCE AND CLEANUP
# ============================================================================

clean: ## Remove all containers, networks, and volumes (⚠️ DESTRUCTIVE)
	@echo "⚠️  WARNING: This will delete all data and containers!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@echo "🧹 Cleaning up all environments..."
	-cd dev && docker-compose -f docker-compose.dev.yml --env-file .env.dev.local down -v --remove-orphans
	-cd uat && docker-compose -f docker-compose.uat.yml --env-file .env.uat.local down -v --remove-orphans
	-cd prod && docker-compose -f docker-compose.prod.yml --env-file .env.prod.local down -v --remove-orphans
	docker system prune -f
	@echo "✅ Cleanup complete"

clean-images: ## Remove all Collab Docker images
	@echo "🧹 Removing Collab images..."
	-docker rmi $$(docker images -q "*collab*") 2>/dev/null || echo "No Collab images to remove"

# ============================================================================
# UTILITIES
# ============================================================================

health: ## Check health of all running services
	@echo "🏥 Health Check:"
	@echo ""
	@echo "Development (port 3000):"
	@curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:3000 || echo "Not running"
	@echo ""
	@echo "UAT (port 3001):"
	@curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:3001 || echo "Not running"
	@echo ""
	@echo "Production (port 3002):"
	@curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:3002 || echo "Not running"
