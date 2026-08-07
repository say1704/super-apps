# Module 20: Health Check

## 1. Function
System health monitoring endpoints providing database connectivity, system resource usage (CPU, memory, disk), and application version info for monitoring and load balancer health checks.

## 2. Business Logic
- **Liveness**: `/health/live` - Simple check that the application is running
- **Readiness**: `/health/ready` - Checks database connectivity and system resources
- **Detailed Health**: `/health` - Full health report with database, SMTP, disk, memory, CPU, version
- **Resource Monitoring**: Uses `psutil` for CPU, memory, disk usage percentages
- **SMTP Check**: Optional SMTP connectivity test (included in detailed health)

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/health` | `HealthDetailResponse` | No | Full health report |
| GET | `/health/live` | `HealthLiveResponse` | No | Liveness probe |
| GET | `/health/ready` | `HealthReadyResponse` | No | Readiness probe |

## 4. Response Schema

### HealthDetailResponse
```json
{
  "status": "healthy",
  "database": "connected",
  "smtp": "ok",
  "disk_usage_percent": 45.2,
  "memory_usage_percent": 62.1,
  "cpu_usage_percent": 12.5,
  "version": "1.0.0"
}
```

### HealthReadyResponse
```json
{
  "status": "ready",
  "database": "connected",
  "disk_usage_percent": 45.2,
  "memory_usage_percent": 62.1
}
```

### HealthLiveResponse
```json
{
  "status": "alive"
}
```

## 5. Database Schema
No dedicated tables. Uses existing database connection for health check.
