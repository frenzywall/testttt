# Administrator Guide
## Change Management Notice Application

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Maintenance](#maintenance)
5. [Backup and Recovery](#backup-and-recovery)
6. [Monitoring](#monitoring)
7. [Security](#security)
8. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Hardware Requirements
- **CPU**: Dual-core processor, 2.0 GHz or higher
- **Memory**: 4 GB RAM minimum, 8 GB recommended
- **Disk Space**: 1 GB free disk space for application and dependencies
- **Network**: Internet connection for external dependencies and timezone data

### Software Requirements
- **Container Platform**: Docker Engine 19.03+ or Docker Desktop 2.2+
- **Orchestration** (optional): Docker Compose 1.25+ or Kubernetes 1.18+
- **Host OS**: Any OS supporting Docker (Linux, Windows with WSL2, macOS)
- **Web Browser**: Chrome 80+, Firefox 78+, Edge 80+, Safari 14+

For non-containerized deployment:
- **Operating System**: Linux (Ubuntu 18.04+, CentOS 7+), Windows 10+, or macOS 10.15+
- **Python**: Version 3.7 or higher
- **Redis**: Version 5.0 or higher
- **Web Server**: Nginx (recommended) or Apache for production deployment
- **WSGI Server**: Gunicorn or uWSGI for production deployment

### Network Requirements
- **Ports**: Default HTTP port (80) or HTTPS port (443) for web access
- **Redis Port**: Default 6379 (configurable)
- **Docker Network**: Isolated container network for application components
- **Firewall Rules**: Allow inbound connections to published container ports
- **DNS**: Domain name configuration if serving publicly

---

## Installation

### Docker Installation (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/change-management-notice.git
cd change-management-notice
```
2. Simply run 

```bash
docker compose up --build -d
```
to build and run the service.

3. To stop:

```bash
docker compose down
```

4. Access the application at http://localhost:5000

### Basic Installation (Alternative)



---

## Configuration

### Docker Environment Configuration

When using Docker, configure the application using environment variables in your `docker-compose.yml` file:

```yaml
environment:
      - FLASK_APP=app.py
      - FLASK_DEBUG=1 or 0 
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PASSKEY=passkey
      - SECRET_KEY=secret
```

Or create a `.env` file and reference it in your `docker-compose.yml`:

```yaml
env_file:
  - .env
```

### Environment Variables

The application can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `FLASK_ENV` | Flask environment (development, production) | `development` |
| `FLASK_DEBUG` | Enable/disable debug mode (0, 1) | `0` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `SECRET_KEY` | Secret key for session management | `default-secret-key` |
| `UPLOAD_FOLDER` | Path for temporary upload storage | `/tmp/uploads` |
| `MAX_CONTENT_LENGTH` | Maximum upload size in bytes | `10 * 1024 * 1024` (10 MB) |
| `AUTH_PASSKEY` | Authentication passkey | `change-me` |
| `HISTORY_SIZE` | Maximum number of history entries | `20` |

### Configuration Files

For production deployment, create a `.env` file in the application root:

```
FLASK_ENV=production
FLASK_DEBUG=0
REDIS_URL=redis://redis-server:6379/0
SECRET_KEY=your-secure-secret-key
UPLOAD_FOLDER=/app/uploads
MAX_CONTENT_LENGTH=10485760
AUTH_PASSKEY=your-secure-passkey
HISTORY_SIZE=20
```

### Web Server Configuration

#### Docker with Nginx Reverse Proxy

For production Docker deployments, use an Nginx container as a reverse proxy:

```yaml
version: '3'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    depends_on:
      - app
    restart: unless-stopped
  
  app:
    # ... existing app configuration ...
  
  redis:
    # ... existing redis configuration ...
```

With `nginx.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://app:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### VM Deployments

##### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

##### Apache Configuration Example

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyPass / http://localhost:5000/
    ProxyPassReverse / http://localhost:5000/
    
    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
```

---

## Maintenance

### Docker Maintenance

#### Update Docker Containers

To update the application:

```bash
# Pull latest code changes
git pull origin main

# Rebuild and update containers
docker-compose build
docker-compose up -d
```

#### View Container Logs

```bash
# App logs
docker-compose logs app

# Redis logs
docker-compose logs redis

# Follow logs in real-time
docker-compose logs -f app
```

#### Container Health Checks

Monitor container health:

```bash
docker ps
docker stats
```

### Redis Maintenance in Docker

```bash
# Connect to Redis container
docker-compose exec redis redis-cli

# Check Redis memory usage
info memory

# Clean Redis database if needed
flushdb  # Caution: This will delete all data
```

### Regular Maintenance Tasks

#### Update Dependencies

Regularly update Python dependencies:

```bash
pip install --upgrade -r requirements.txt
```

#### Redis Maintenance

Check Redis memory usage:

```bash
redis-cli info memory
```

Clean Redis database if needed:

```bash
redis-cli flushdb  # Caution: This will delete all data
```

#### Application Updates

To update the application:

1. Pull the latest code:
```bash
git pull origin main
```

2. Restart the application:
```bash
# If running directly
supervisorctl restart change-management-app

# If running with Docker
docker-compose pull
docker-compose up -d
```

### Log Management in Docker

To manage logs in Docker:

1. Configure Docker's log rotation in `/etc/docker/daemon.json`:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

2. Restart Docker daemon:
```bash
sudo systemctl restart docker
```

### Log Rotation

Configure log rotation to manage log file sizes:

```
/var/log/change-management-app/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload change-management-app.service
    endscript
}
```

---

## Backup and Recovery

### Docker Volume Backups

#### Redis Data Backup in Docker

1. Create a backup script:
```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/redis

mkdir -p $BACKUP_DIR

# Create Redis backup
docker-compose exec -T redis redis-cli SAVE
docker run --rm -v change-management-notice_redis_data:/data -v $BACKUP_DIR:/backup alpine tar -czf /backup/redis_backup_$TIMESTAMP.tar.gz /data
```

2. Add to crontab:
```
0 */6 * * * /path/to/docker-redis-backup.sh
```

#### Application Volume Backup

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/change-management-app

mkdir -p $BACKUP_DIR

# Backup uploads volume
docker run --rm -v change-management-notice_app_uploads:/data -v $BACKUP_DIR:/backup alpine tar -czf /backup/uploads_backup_$TIMESTAMP.tar.gz /data
```

### Backup Procedures

#### Redis Data Backup

1. Configure Redis persistence by editing `/etc/redis/redis.conf`:
```
save 900 1
save 300 10
save 60 10000
```

2. Create automated Redis backups with a cron job:
```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/redis

mkdir -p $BACKUP_DIR
redis-cli save
cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb
```

3. Add to crontab:
```
0 */6 * * * /path/to/redis-backup.sh
```

#### Application Configuration Backup

Regularly backup configuration files:

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/change-management-app

mkdir -p $BACKUP_DIR
cp /path/to/app/.env $BACKUP_DIR/.env_$TIMESTAMP
```

### Recovery Procedures

#### Redis Data Recovery in Docker

```bash
# Stop containers
docker-compose down

# Restore from backup
docker run --rm -v change-management-notice_redis_data:/data -v /var/backups/redis:/backup alpine sh -c "rm -rf /data/* && tar -xzf /backup/redis_backup_20230615_120000.tar.gz -C /"

# Start containers
docker-compose up -d
```

#### Full System Recovery with Docker

1. Install Docker and Docker Compose
2. Clone the repository
3. Restore Redis volume from backup
4. Restore uploads volume from backup
5. Start containers with `docker-compose up -d`

#### Redis Data Recovery

1. Stop Redis:
```bash
sudo systemctl stop redis
```

2. Replace the dump.rdb file:
```bash
cp /var/backups/redis/dump_20230615_120000.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
```

3. Start Redis:
```bash
sudo systemctl start redis
```

#### Full System Recovery

1. Install system prerequisites
2. Restore application code
3. Restore Redis data
4. Restore configuration files
5. Start the application

---

## Monitoring

### Docker Container Monitoring

1. Basic Docker monitoring:
```bash
# Check container status
docker ps

# View resource usage
docker stats
```

2. Use container monitoring tools:
   - Prometheus + Grafana
   - cAdvisor
   - Portainer
   - Docker Desktop Dashboard

3. Create a Docker health check in your `docker-compose.yml`:
```yaml
services:
  app:
    # ... other settings ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Health Checks

Create a health check endpoint in the application:

```python
@app.route('/health')
def health_check():
    try:
        # Check Redis connection
        redis_client.ping()
        return jsonify({"status": "healthy", "redis": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500
```

Configure monitoring system to check this endpoint periodically.

### Performance Monitoring

Monitor key metrics:

1. **System Resources**:
   - CPU usage
   - Memory usage
   - Disk space
   - Network traffic

2. **Application Metrics**:
   - Request response time
   - Error rate
   - Active users
   - Redis memory usage
   - Upload frequency and size

### Alerting

Set up alerts for critical conditions:

1. **System Alerts**:
   - CPU usage > 90% for 5 minutes
   - Memory usage > 90% for 5 minutes
   - Disk space < 10% free
   - Service down (web server, Redis)

2. **Application Alerts**:
   - Health check fails
   - Error rate > 5% for 5 minutes
   - Response time > 2 seconds for 5 minutes

---

## Security

### Docker Security Best Practices

1. **Container Security**:
   - Use official base images
   - Keep images updated
   - Scan images for vulnerabilities with tools like Trivy or Docker Scout
   - Run containers with limited capabilities
   - Use non-root users inside containers

2. **Docker Network Security**:
   - Use dedicated Docker networks
   - Limit port exposure
   - Use internal Docker DNS instead of IP addresses
   - Enable TLS for Docker daemon

3. **Volume Security**:
   - Use proper permissions on mounted volumes
   - Avoid mounting sensitive host directories
   - Use Docker secrets for sensitive information

4. **Resource Limits**:
   - Set memory and CPU limits for containers
   - Enable Docker content trust
   - Implement logging and monitoring

### Security Best Practices

1. **Environment Hardening**:
   - Keep Docker and host OS updated
   - Configure host firewall rules
   - Run minimal services on the host
   - Enable secure computing mode (seccomp)
   - Use container isolation features

2. **Application Security**:
   - Use HTTPS with valid certificates
   - Implement proper authentication
   - Follow secure coding practices
   - Validate all user inputs

3. **Redis Security in Docker**:
   - Use a dedicated Docker network for Redis
   - Don't publish Redis port to the host
   - Add password authentication in redis.conf:
     ```
     requirepass your-strong-password
     ```
   - Update the REDIS_URL to include password:
     ```
     REDIS_URL=redis://default:your-strong-password@redis:6379/0
     ```

### Access Control

1. **Replace Default Passkey**:
   - Set a strong AUTH_PASSKEY in the docker-compose.yml environment
   - Use Docker secrets for production:
     ```yaml
     services:
       app:
         # ... other settings ...
         secrets:
           - auth_passkey
     
     secrets:
       auth_passkey:
         file: ./secrets/auth_passkey.txt
     ```
   - Rotate the passkey periodically
   - Distribute securely to authorized users

2. **Network Security**:
   - Use Nginx in a separate container as a reverse proxy
   - Configure CORS appropriately
   - Limit access to admin functions by IP
   - Implement rate limiting in Nginx

### Data Protection

1. **Sensitive Data Handling**:
   - Use Docker secrets for sensitive configuration
   - Never log sensitive information
   - Don't store secrets in images or Dockerfile
   - Use environment variables passed to containers
   - Consider encryption for volume data

2. **Regular Security Audits**:
   - Scan Docker images regularly
   - Review container logs for suspicious activity
   - Verify volume permissions
   - Check for unauthorized access attempts
   - Monitor Docker events: `docker events`

---

## Troubleshooting

### Docker-Specific Issues

#### Container Won't Start

**Problem**: Docker container fails to start.

**Troubleshooting**:
1. Check container logs: `docker-compose logs app`
2. Check for port conflicts: `docker port app`
3. Verify Docker resource availability: `docker info`
4. Check container status: `docker ps -a`

**Solution**:
- Fix port conflicts by modifying the port mapping
- Ensure sufficient resources are available
- Rebuild image if necessary: `docker-compose build app`

#### Container Networking Issues

**Problem**: Containers can't communicate with each other.

**Troubleshooting**:
1. Check network configuration: `docker network ls`
2. Inspect network details: `docker network inspect change-management-notice_default`
3. Test connectivity from inside a container: `docker-compose exec app ping redis`

**Solution**:
- Ensure containers are on the same network
- Check service names are correct in the Redis URL
- Restart Docker networking: `docker-compose down && docker-compose up -d`

#### Volume Permission Issues

**Problem**: Application can't write to mounted volumes.

**Troubleshooting**:
1. Check volume permissions: `docker-compose exec app ls -la /app/uploads`
2. Verify volume mounts: `docker-compose exec app mount | grep app`
3. Inspect volume details: `docker volume inspect change-management-notice_app_uploads`

**Solution**:
- Fix permissions inside container: `docker-compose exec app chown -R user:user /app/uploads`
- Recreate volume with proper permissions: `docker-compose down -v && docker-compose up -d`

### Common Issues and Solutions

#### Application Won't Start

**Problem**: Flask application fails to start.

**Troubleshooting**:
1. Check Python version: `python --version`
2. Verify virtual environment is activated
3. Check for error messages in logs
4. Verify all dependencies are installed
5. Check file permissions

**Solution**: 
- Install any missing dependencies: `pip install -r requirements.txt`
- Fix file permissions: `chmod -R 755 /path/to/application`
- Check log files for specific errors

#### Redis Connection Issues

**Problem**: Application can't connect to Redis.

**Troubleshooting**:
1. Check if Redis is running: `redis-cli ping`
2. Verify Redis connection URL is correct
3. Check Redis logs
4. Test connectivity from application server

**Solution**:
- Start Redis service: `sudo systemctl start redis`
- Update Redis connection URL in configuration
- Check firewall rules if Redis is on another server

#### File Upload Problems

**Problem**: MSG file uploads fail.

**Troubleshooting**:
1. Check upload directory permissions
2. Verify maximum file size settings
3. Check for disk space issues
4. Look for errors in application logs

**Solution**:
- Fix directory permissions: `chmod 755 /path/to/upload/directory`
- Increase maximum file size in configuration
- Free up disk space
- Ensure extract-msg library is installed

### Logging and Diagnostics

#### Docker Container Logs

```bash
# View app container logs
docker-compose logs app

# Follow logs in real-time with timestamps
docker-compose logs -f --timestamps app

# View Redis container logs
docker-compose logs redis

# View last 100 lines
docker-compose logs --tail=100 app
```

#### Application Logs Inside Container

To access logs inside the container:

```bash
docker-compose exec app cat /app/logs/app.log
```

#### Diagnostic Commands for Docker

```bash
# Check container status and health
docker ps

# Container resource usage
docker stats

# Inspect container configuration
docker inspect change-management-notice_app_1

# Check Redis connectivity from app container
docker-compose exec app python -c "import redis; r = redis.Redis(host='redis'); print(r.ping())"

# Check application processes
docker-compose exec app ps aux

# Check network connections
docker-compose exec app netstat -tulpn
```

#### Application Logs

Application logs are stored in:
- Development: Output to console
- Production: `/var/log/change-management-app/app.log`

To increase log verbosity, set environment variable:
```
FLASK_DEBUG=1
```

#### Redis Logs

Redis logs are located at:
- Linux: `/var/log/redis/redis-server.log`
- Windows: Installation directory

Enable verbose logging in `/etc/redis/redis.conf`:
```
loglevel verbose
```

#### Diagnostic Commands

Redis diagnostics:
```bash
redis-cli info
redis-cli memory stats
redis-cli client list
```

Application diagnostics:
```bash
# Check Python dependencies
pip list

# Check Redis connectivity
python -c "import redis; r = redis.Redis(); print(r.ping())"

# Check file permissions
ls -la /path/to/application

# Check system resources
df -h
free -m
top
```

---

*For additional support, contact the application development team or submit an issue on GitHub.*
