#!/bin/sh
set -e

echo "🚀 Starting Collab in Development Mode..."

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

# Generate Prisma client (ensure it's up to date)
echo "🔧 Generating Prisma client..."
npx prisma generate

# Auto-seed database in development if SEED_DATABASE is true
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database for development..."
  npm run prisma:init-workspace || echo "⚠️  Workspace initialization completed or already exists"
fi

echo "🏢 Starting Collab development server with hot-reload..."
echo "🔗 Application will be available at: http://localhost:3000"
echo "🐛 Debugger available at: chrome://inspect (port 9229)"

# Start Next.js in development mode with debugging enabled
exec npm run dev

