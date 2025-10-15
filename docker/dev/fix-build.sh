#!/bin/bash

# Fix Docker build issues on remote server
# Run this script on your remote server

echo "🧹 Cleaning up Docker resources to free space..."

# Stop all containers
cd /mnt/files/collab/docker/dev
docker compose -f docker-compose.dev.yml --env-file .env.dev.local down 2>/dev/null || true

# Clean up Docker
echo "🗑️  Removing unused Docker resources..."
docker system prune -af --volumes

# Show disk space
echo "💾 Current disk usage:"
df -h

# Clean npm cache
echo "🧹 Cleaning npm cache..."
npm cache clean --force

# Check if .env.dev.local exists
if [ ! -f .env.dev.local ]; then
    echo "❌ ERROR: .env.dev.local not found!"
    echo "Please create it from .env.dev.template"
    exit 1
fi

echo "✅ Cleanup complete!"
echo ""
echo "Now try building again:"
echo "docker compose -f docker-compose.dev.yml --env-file .env.dev.local up -d --build"

