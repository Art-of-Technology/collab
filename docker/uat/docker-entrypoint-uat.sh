#!/bin/sh
set -e

echo "🚀 Starting Collab in UAT Mode..."

# Prisma client was already generated during build
echo "✅ Prisma client ready (generated during build)"

echo "🏢 Starting Collab UAT server..."
echo "🔗 Application running on port 3000 (exposed as 3004)"
echo "🧪 UAT Environment - For testing and staging purposes"

# Start the Next.js application
exec node server.js

