#!/bin/sh
set -e

echo "🚀 Starting Collab in Development Mode (Production Build)..."

# Prisma client was already generated during build
echo "✅ Prisma client ready (generated during build)"

# Auto-seed database in development if SEED_DATABASE is true
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding development database..."
  npm run prisma:init-workspace || echo "⚠️  Workspace initialization completed or already exists"
fi

echo "🏢 Starting Collab development server (optimized build)..."
echo "🔗 Application running on: http://localhost:3000"
echo "💡 Development Environment - Built for performance"
echo "⚡ Note: Changes require rebuild. Use 'make dev-restart' to apply code changes."

# Start the Next.js application (using the optimized standalone build)
exec node server.js
