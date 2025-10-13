#!/bin/sh
set -e

echo "🚀 Starting Collab in Production Mode..."

# Generate Prisma client (already done in build, but ensure it's available)
echo "🔧 Verifying Prisma client..."
npx prisma generate

echo "✅ Prisma client ready!"

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

