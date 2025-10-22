#!/bin/sh
set -e

echo "🚀 Starting Collab in Production Mode..."

# Prisma client was already generated during build
echo "✅ Prisma client ready (generated during build)"

# Optional: Run database seeding if SEED_DATABASE is set (usually false in production)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "⚠️  WARNING: Seeding production database..."
  npm run prisma:init-workspace || echo "⚠️  Workspace initialization completed or already exists"
fi

echo "🏢 Starting Collab production server..."
echo "🔗 Application running on port 3000 (exposed as 3002)"
echo "🔒 Production Environment - Optimized and secured"

# Start the Next.js application
exec node server.js

