#!/bin/sh
set -e

echo "🚀 Starting Collab in UAT Mode..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until npx prisma db push --accept-data-loss 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client (if not already generated)
echo "🔧 Ensuring Prisma client is generated..."
npx prisma generate

# Seed database if SEED_DATABASE is set
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding UAT database..."
  npm run prisma:init-workspace || echo "⚠️  Workspace initialization completed or already exists"
fi

echo "🏢 Starting Collab UAT server..."
echo "🔗 Application will be available at: http://localhost:3001"
echo "🧪 UAT Environment - For testing and staging purposes"

# Start the Next.js application
exec node server.js

