# 🔧 Development Monitoring Tools

## 🚀 **What's Available:**

### **1. Redis Commander** - `http://localhost:8081`
**Purpose**: Redis database management
- ✅ View all Redis keys and values
- ✅ Monitor memory usage
- ✅ See active connections
- ✅ Real-time performance metrics
- ✅ Debug cache/session issues

### **2. Uptime Kuma** - `http://localhost:3001`
**Purpose**: Application health monitoring
- ✅ Monitor your Collab app uptime
- ✅ Track API endpoint response times
- ✅ Get alerts when services go down
- ✅ Beautiful dashboard with charts
- ✅ HTTP/HTTPS/TCP monitoring

**Setup:** First visit will ask you to create an admin account

### **3. Portainer** - `http://localhost:9000`
**Purpose**: Docker container management
- ✅ View all running containers
- ✅ Monitor CPU/Memory usage
- ✅ View container logs
- ✅ Restart/stop containers easily
- ✅ Image management

**Setup:** First visit will ask you to create an admin account

## 🎯 **Quick Setup Guide:**

### **Step 1: Restart with new tools**
```cmd
cd docker\dev
docker compose -f docker-compose.dev.yml --env-file .env.dev.local down
docker compose -f docker-compose.dev.yml --env-file .env.dev.local up -d
```

### **Step 2: Access monitoring tools**
- **Collab App**: http://localhost:3000
- **Redis**: http://localhost:8081 
- **Health**: http://localhost:3001 (setup admin first)
- **Docker**: http://localhost:9000 (setup admin first)

### **Step 3: Configure Uptime Kuma monitors**
Add these monitors in Uptime Kuma:
- **Collab Homepage**: `http://localhost:3000`
- **API Health**: `http://localhost:3000/api/health` (if you have one)
- **Redis**: Host: `redis-17044.c72.eu-west-1-2.ec2.redns.redis-cloud.com:17044`

## 🔥 **Benefits:**
- **Debug faster**: See exactly what's in Redis
- **Monitor health**: Know when something breaks
- **Manage containers**: Easy Docker management
- **Performance insights**: Track response times
- **Professional setup**: Production-like monitoring

## ❌ **Removed Services:**
- **pgAdmin**: Security risk removed
- **MailHog**: Not needed for outbound-only email
