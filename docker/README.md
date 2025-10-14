# 🐳 Docker Setup for Collab

This document provides comprehensive instructions for running Collab using Docker across different environments (Development, UAT, Production).

**Architecture**: This setup uses **external cloud databases** (NeonDB, AWS RDS) and **Cloud Redis** instead of local database containers for better scalability and production readiness.

## 🚀 Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- At least 2GB RAM available for Docker (reduced since no local databases)
- 5GB free disk space (reduced since no database volumes)
- **External Database Access**: NeonDB for development, AWS RDS for UAT/production
- **Cloud Redis Access**: Your cloud Redis instance

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd collab
```

### 2. Choose Your Environment

Collab supports three environments with separate configurations:

- **Development** (`/docker/dev/`) - Hot-reload, debugging tools, development database
- **UAT** (`/docker/uat/`) - Staging environment for testing
- **Production** (`/docker/prod/`) - Optimized production deployment

### 3. Environment Configuration

```bash
# Copy the appropriate environment template
cp docker/dev/.env.dev.template docker/dev/.env.dev.local     # Development
cp docker/uat/.env.uat.template docker/uat/.env.uat.local     # UAT
cp docker/prod/.env.prod.template docker/prod/.env.prod.local # Production

# Edit the environment file with your actual values
nano docker/dev/.env.dev.local  # or your preferred editor
```

**Important**: Fill in at least these required variables:
- `NEXTAUTH_SECRET` (generate with: `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (for authentication)
- `ENCRYPTION_KEY` (generate with: `openssl rand -base64 32`)

### 4. Start the Application

```bash
# Development
make dev

# UAT
make uat

# Production
make prod
```

### 5. Access the Application

#### Development
- **Collab Platform**: http://localhost:3000
- **pgAdmin**: http://localhost:5050 (dev@collab.local / devpassword) - *Connects to external NeonDB*
- **Redis Commander**: http://localhost:8081 - *Connects to external Cloud Redis*
- **MailHog (Email Testing)**: http://localhost:8025

#### UAT
- **Collab Platform**: http://localhost:3001
- **pgAdmin**: http://localhost:5051 (uat@collab.local / uatpassword) - *Connects to external database*
- **Redis Commander**: http://localhost:8082 - *Connects to external Cloud Redis*

#### Production
- **Collab Platform**: http://localhost:3002
- **pgAdmin**: http://localhost:5052 (only with --profile admin) - *Connects to external AWS RDS*
- **Redis Commander**: http://localhost:8083 (only with --profile admin) - *Connects to external Cloud Redis*

## 📁 Directory Structure

```
docker/
├── dev/                          # Development environment
│   ├── docker-compose.dev.yml    # Development services
│   ├── Dockerfile.dev            # Development build
│   ├── .env.dev.template         # Development environment template
│   ├── docker-entrypoint-dev.sh  # Development startup script
│   └── .env.dev.local            # Your development config (gitignored)
│
├── uat/                          # UAT/Staging environment
│   ├── docker-compose.uat.yml    # UAT services
│   ├── Dockerfile.uat            # UAT build
│   ├── .env.uat.template         # UAT environment template
│   ├── docker-entrypoint-uat.sh  # UAT startup script
│   └── .env.uat.local            # Your UAT config (gitignored)
│
├── prod/                         # Production environment
│   ├── docker-compose.prod.yml   # Production services
│   ├── Dockerfile.prod           # Production build
│   ├── .env.prod.template        # Production environment template
│   ├── docker-entrypoint-prod.sh # Production startup script
│   └── .env.prod.local           # Your production config (gitignored)
│
├── shared/                       # Shared Docker resources
│   └── .dockerignore             # Common Docker ignore file
│
├── README.md                     # This file
└── Makefile                      # Environment management commands
```

## 🛠 Environment Details

### Development Environment
- **Purpose**: Active development with hot-reload
- **Database**: External NeonDB PostgreSQL
- **Cache**: External Cloud Redis
- **Features**: 
  - Live code reloading
  - Debug tools (Node.js debugger on port 9229)
  - Email testing with MailHog
  - External database migrations and seeding
  - Admin tools for external services

### UAT Environment
- **Purpose**: Staging/testing environment
- **Database**: External AWS RDS or similar PostgreSQL
- **Cache**: External Cloud Redis
- **Features**:
  - Production-like build but with UAT configurations
  - External database and Redis connections
  - Testing integrations with staging APIs
  - Monitoring and logging enabled

### Production Environment
- **Purpose**: Live production deployment
- **Database**: External AWS RDS PostgreSQL
- **Cache**: External Cloud Redis
- **Features**:
  - Optimized builds with minimal image size
  - Security hardened
  - Health checks and auto-restart
  - Optional admin tools for external services (--profile admin)
  - SSL-ready configuration

## 📝 Common Commands

### Quick Start Commands
```bash
make help              # Show all available commands
make dev-first-run     # Complete development setup
make uat-first-run     # Complete UAT setup  
make prod-first-run    # Complete production setup
```

### Environment Management
```bash
make dev               # Start development environment
make dev-down          # Stop development environment
make dev-restart       # Restart development environment

make uat               # Start UAT environment
make uat-down          # Stop UAT environment
make uat-restart       # Restart UAT environment

make prod              # Start production environment
make prod-down         # Stop production environment
make prod-restart      # Restart production environment
```

### Database Operations (External Services)
```bash
make dev-db-migrate    # Run migrations on external NeonDB
make dev-db-seed       # Seed external development database
make dev-db-studio     # Open Prisma Studio for NeonDB

make uat-db-migrate    # Run migrations on external UAT database
make uat-db-studio     # Open Prisma Studio for UAT database

make prod-db-migrate   # Run migrations on external AWS RDS
make prod-db-studio    # Open Prisma Studio for production (⚠️ USE WITH CAUTION)
```

**Note**: Database backups should be handled by your cloud provider (NeonDB automatic backups, AWS RDS snapshots, etc.)

### Monitoring and Logs
```bash
make dev-logs          # View development logs
make dev-status        # Check development service status

make uat-logs          # View UAT logs
make uat-status        # Check UAT service status

make prod-logs         # View production logs
make prod-status       # Check production service status
```

## 🔧 Configuration Management

### External Services Setup

Before running any environment, you need to configure your external services:

#### Database URLs
```bash
# Development (NeonDB)
DATABASE_URL_DEV=postgresql://neondb_owner:password@your-neon-host/neondb?sslmode=require

# UAT (AWS RDS or similar)  
DATABASE_URL_UAT=postgresql://username:password@your-uat-db-host:5432/collab_uat

# Production (AWS RDS)
DATABASE_URL_PROD=postgresql://username:password@your-prod-rds-endpoint:5432/collab
```

#### Redis Configuration
```bash
# Cloud Redis (shared across environments or separate instances)
REDIS_URL=redis://default:password@your-redis-host:port
```

### Environment Variables

Each environment uses its own configuration file:

- **Development**: `docker/dev/.env.dev.local`
- **UAT**: `docker/uat/.env.uat.local`
- **Production**: `docker/prod/.env.prod.local`

### Key Configuration Areas

#### Authentication
- Configure Google OAuth for user authentication
- Set secure NEXTAUTH_SECRET for session management
- Configure GitHub OAuth for project integration

#### Database Configuration (External Services)
- **Development**: NeonDB PostgreSQL (DATABASE_URL_DEV)
- **UAT**: AWS RDS or similar PostgreSQL (DATABASE_URL_UAT)  
- **Production**: AWS RDS PostgreSQL (DATABASE_URL_PROD)
- Automated migrations and seeding via Prisma

#### External Services
- Environment-specific API keys
- Staging vs production service endpoints
- Feature flags and toggles

#### Real-time Features
- Pusher configuration per environment
- WebSocket URLs
- Redis configuration

## 🐛 Troubleshooting

### Port Conflicts
Each environment uses different ports to avoid conflicts:

- **Dev**: 3000 (app), 5050 (pgadmin), 8081 (redis-commander), 8025 (mailhog)
- **UAT**: 3001 (app), 5051 (pgadmin), 8082 (redis-commander)
- **Prod**: 3002 (app), 5052 (pgadmin), 8083 (redis-commander)

### External Services Issues

#### Database Connection Problems
```bash
# Test database connectivity from within container
make dev-shell
npx prisma db push --preview-feature

# Check database URL format
echo $DATABASE_URL_DEV
```

#### Redis Connection Issues
```bash
# Verify Redis connection
make dev-shell
node -e "const redis = require('redis'); const client = redis.createClient(process.env.REDIS_URL); client.ping().then(() => console.log('Redis connected')).catch(console.error)"
```

### Common Issues

#### Environment-Specific Debugging
```bash
# Check specific environment status
make dev-status   # or uat-status, prod-status

# View environment logs
make dev-logs     # or uat-logs, prod-logs

# Access environment shell
make dev-shell    # or uat-shell, prod-shell
```

#### Database Issues
```bash
# Reset specific environment database
make dev-db-reset     # ⚠️ DESTRUCTIVE
make uat-db-reset     # ⚠️ DESTRUCTIVE
# Production reset requires manual confirmation
```

## 🔐 Security Considerations

### Environment Separation
- Each environment has isolated networks
- Separate credentials and API keys
- Environment-specific security configurations

### Production Security
- Non-root container users
- Minimal attack surface
- SSL/TLS ready configuration
- Secrets management integration ready

## 📚 Migration from Root Docker Files

If you have existing Docker files in the root directory, migrate using:

```bash
# The new structure replaces these root files:
# Dockerfile → docker/prod/Dockerfile.prod
# docker-compose.yml → docker/prod/docker-compose.prod.yml
# .env.docker → docker/prod/.env.prod.template
```

## 🆘 Support

Environment-specific support:

1. **Development Issues**: Check `docker/dev/` configurations and use `make dev-logs`
2. **UAT Issues**: Verify staging service configurations in `docker/uat/`
3. **Production Issues**: Review production settings in `docker/prod/`

For more help, consult the main project documentation or create an issue in the repository.
