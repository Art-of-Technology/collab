# Collab Development Server - Quick Start Script
# Run this script to start the development server on Windows
# For GitOps deployment, use ArgoCD instead

Write-Host "🚀 Starting Collab Development Server..." -ForegroundColor Cyan
Write-Host ""

# Check if .env.dev.local exists
if (-Not (Test-Path ".env.dev.local")) {
    Write-Host "❌ Error: .env.dev.local not found!" -ForegroundColor Red
    Write-Host "📝 Please copy .env.dev.template to .env.dev.local and configure it first." -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
} catch {
    Write-Host "❌ Error: Docker is not running!" -ForegroundColor Red
    Write-Host "📝 Please start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host "✅ Environment file found" -ForegroundColor Green
Write-Host ""

# Start the development environment
Write-Host "🔨 Starting Docker containers..." -ForegroundColor Cyan
docker compose -f docker-compose.dev.yml --env-file .env.dev.local up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Development environment started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Available Services:" -ForegroundColor Cyan
    Write-Host "  • Collab App:        http://localhost:3000" -ForegroundColor White
    Write-Host "  • Redis Commander:   http://localhost:8081" -ForegroundColor White
    Write-Host "  • Uptime Kuma:       http://localhost:3001" -ForegroundColor White
    Write-Host "  • Portainer:         http://localhost:9000" -ForegroundColor White
    Write-Host ""
    Write-Host "📝 Useful Commands:" -ForegroundColor Cyan
    Write-Host "  • View logs:   docker compose -f docker-compose.dev.yml logs -f" -ForegroundColor White
    Write-Host "  • Stop:        docker compose -f docker-compose.dev.yml down" -ForegroundColor White
    Write-Host "  • Restart:     docker compose -f docker-compose.dev.yml restart" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Failed to start development environment!" -ForegroundColor Red
    Write-Host "📝 Check the error messages above for details." -ForegroundColor Yellow
    exit 1
}

