"""Seed dummy data for Log & Maintenance Evidence module"""
from sqlalchemy.orm import Session
from datetime import date, timedelta
from database import get_db, engine
from models import Base, LogMaintenance, User

# Sample data
DUMMY_DATA = [
    {
        "server": "SRV-WEB-001",
        "path": "/var/log/nginx/",
        "script_execution": "logrotate -f /etc/logrotate.d/nginx",
        "execution_date": date.today() - timedelta(days=1),
        "size": "2.5 GB",
        "notes": "Weekly log rotation for nginx access and error logs"
    },
    {
        "server": "SRV-DB-001",
        "path": "/var/log/postgresql/",
        "script_execution": "pg_dump --verbose > /backup/db_backup.sql",
        "execution_date": date.today() - timedelta(days=2),
        "size": "15.3 GB",
        "notes": "Full database backup before maintenance window"
    },
    {
        "server": "SRV-APP-001",
        "path": "/opt/app/logs/",
        "script_execution": "python3 cleanup_logs.py --days 30",
        "execution_date": date.today() - timedelta(days=3),
        "size": "1.2 GB",
        "notes": "Cleaned old application logs older than 30 days"
    },
    {
        "server": "SRV-WEB-002",
        "path": "/var/log/apache2/",
        "script_execution": "tar -czf apache_logs.tar.gz *.log",
        "execution_date": date.today() - timedelta(days=5),
        "size": "850 MB",
        "notes": "Archived Apache logs for compliance storage"
    },
    {
        "server": "SRV-MAIL-001",
        "path": "/var/log/mail/",
        "script_execution": "mailq | grep -E '^[A-F0-9]+' | wc -l",
        "execution_date": date.today() - timedelta(days=7),
        "size": "125 MB",
        "notes": "Mail queue monitoring and log analysis"
    },
    {
        "server": "SRV-DB-002",
        "path": "/var/log/mysql/",
        "script_execution": "mysqlcheck --all-databases --optimize",
        "execution_date": date.today() - timedelta(days=10),
        "size": "3.8 GB",
        "notes": "Database optimization and log cleanup"
    },
    {
        "server": "SRV-BACKUP-001",
        "path": "/backup/logs/",
        "script_execution": "rsync -av /backup/logs/ /mnt/external/backup-logs/",
        "execution_date": date.today() - timedelta(days=14),
        "size": "25.0 GB",
        "notes": "Offsite backup of all system logs"
    },
    {
        "server": "SRV-MON-001",
        "path": "/var/log/zabbix/",
        "script_execution": "zabbix_server --config-check",
        "execution_date": date.today() - timedelta(days=15),
        "size": "500 MB",
        "notes": "Zabbix monitoring system log verification"
    },
    {
        "server": "SRV-PROXY-001",
        "path": "/var/log/squid/",
        "script_execution": "squid-log-analyzer --report daily",
        "execution_date": date.today() - timedelta(days=20),
        "size": "4.2 GB",
        "notes": "Proxy log analysis for security audit"
    },
    {
        "server": "SRV-FTP-001",
        "path": "/var/log/vsftpd/",
        "script_execution": "grep 'OK' vsftpd.log | wc -l",
        "execution_date": date.today() - timedelta(days=25),
        "size": "180 MB",
        "notes": "FTP transfer log statistics"
    },
    {
        "server": "SRV-DNS-001",
        "path": "/var/log/bind/",
        "script_execution": "named-checkconf && named-checkzone",
        "execution_date": date.today() - timedelta(days=30),
        "size": "950 MB",
        "notes": "DNS server configuration and zone validation"
    },
    {
        "server": "SRV-LDAP-001",
        "path": "/var/log/slapd/",
        "script_execution": "slapcat -l ldap_backup.ldif",
        "execution_date": date.today() - timedelta(days=45),
        "size": "320 MB",
        "notes": "LDAP directory backup and log rotation"
    },
    # KB size entries
    {
        "server": "SRV-DEV-001",
        "path": "/home/dev/logs/",
        "script_execution": "cat app.log | grep ERROR",
        "execution_date": date.today() - timedelta(days=4),
        "size": "45 KB",
        "notes": "Development server error log check"
    },
    {
        "server": "SRV-TEST-001",
        "path": "/var/log/test/",
        "script_execution": "pytest --log-file=test.log",
        "execution_date": date.today() - timedelta(days=6),
        "size": "128 KB",
        "notes": "Test execution logs"
    },
    {
        "server": "SRV-STAGING-001",
        "path": "/opt/staging/logs/",
        "script_execution": "tail -n 1000 staging.log",
        "execution_date": date.today() - timedelta(days=8),
        "size": "256 KB",
        "notes": "Staging environment log snapshot"
    },
    {
        "server": "SRV-API-001",
        "path": "/var/log/api/",
        "script_execution": "jq '.status' api_response.log",
        "execution_date": date.today() - timedelta(days=12),
        "size": "64 KB",
        "notes": "API response log analysis"
    },
    {
        "server": "SRV-CACHE-001",
        "path": "/var/log/redis/",
        "script_execution": "redis-cli INFO | grep stats",
        "execution_date": date.today() - timedelta(days=18),
        "size": "32 KB",
        "notes": "Redis cache statistics log"
    },
    {
        "server": "SRV-QUEUE-001",
        "path": "/var/log/rabbitmq/",
        "script_execution": "rabbitmqctl list_queues",
        "execution_date": date.today() - timedelta(days=22),
        "size": "89 KB",
        "notes": "Message queue status log"
    },
    {
        "server": "SRV-CONTAINER-001",
        "path": "/var/log/docker/",
        "script_execution": "docker logs --tail 500 container_id",
        "execution_date": date.today() - timedelta(days=28),
        "size": "512 KB",
        "notes": "Docker container log export"
    },
    {
        "server": "SRV-K8S-001",
        "path": "/var/log/kubernetes/",
        "script_execution": "kubectl logs --tail=200 pod_name",
        "execution_date": date.today() - timedelta(days=35),
        "size": "178 KB",
        "notes": "Kubernetes pod log extraction"
    },
]

def seed_data():
    db = Session(bind=engine)
    
    try:
        # Check if data already exists
        existing = db.query(LogMaintenance).count()
        if existing > 0:
            print(f"⚠️  Database already has {existing} log entries. Skipping seed.")
            return
        
        # Get admin user (id=1)
        admin = db.query(User).filter(User.id == 1).first()
        if not admin:
            print("❌ Admin user not found. Please create admin user first.")
            return
        
        # Insert dummy data
        for item in DUMMY_DATA:
            log_entry = LogMaintenance(
                server=item["server"],
                path=item["path"],
                script_execution=item["script_execution"],
                execution_date=item["execution_date"],
                size=item["size"],
                notes=item["notes"],
                created_by=admin.id
            )
            db.add(log_entry)
        
        db.commit()
        print(f"✅ Successfully inserted {len(DUMMY_DATA)} dummy log entries!")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("🌱 Seeding Log & Maintenance Evidence module...")
    seed_data()
