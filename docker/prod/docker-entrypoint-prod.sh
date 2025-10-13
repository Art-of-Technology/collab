#!/bin/sh
set -e

echo "🚀 Starting Collab in Production Mode..."

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

# Optional: Run database seeding if SEED_DATABASE is set (usually false in production)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding production database..."
  npm run prisma:init-workspace || echo "⚠️  Workspace initialization completed or already exists"
fi

echo "🏢 Starting Collab production server..."
echo "🔗 Application starting on port 3002"
echo "🔒 Production Environment - Optimized and secured"

# Start the Next.js application
exec node server.js

