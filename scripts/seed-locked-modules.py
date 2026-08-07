#!/usr/bin/env python3
"""
Seed dummy data for 4 LOCKED modules to test pagination:
1. Work Log Module
2. Project Tasks Module
3. Log Deletion (Log Maintenance)
4. Log Compression

Target: 50+ records per module to test pagination (20 records/page)
"""

import requests
from datetime import datetime, timedelta
import random

BASE_URL = "http://localhost:8001"

# ==================== AUTHENTICATION ====================
def login():
    """Login and get access token"""
    resp = requests.post(f"{BASE_URL}/token", data={
        "username": "admin",
        "password": "CHANGE_ME",
        "grant_type": "password"
    })
    if resp.status_code == 200:
        return resp.json().get("access_token")
    else:
        print(f"❌ Login failed: {resp.status_code}")
        return None

# ==================== HELPER FUNCTIONS ====================
def random_date(start_days_ago, end_days_ago=0):
    """Generate random date between start_days_ago and end_days_ago"""
    days = random.randint(end_days_ago, start_days_ago)
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

def random_time():
    """Generate random time between 08:00 - 18:00"""
    hour = random.randint(8, 17)
    minute = random.choice([0, 15, 30, 45])
    return f"{hour:02d}:{minute:02d}"

def print_header(title):
    """Print section header"""
    print()
    print("=" * 70)
    print(f"  {title}")
    print("=" * 70)

# ==================== MODULE 1: WORK LOG ====================
def seed_work_logs(token, headers, count=60):
    """Seed dummy work log entries"""
    print_header("📅 SEEDING WORK LOG MODULE")
    
    categories = ["General", "Meeting", "Development", "Maintenance", "Support", "Documentation", "Training", "Other"]
    statuses = ["in_progress", "done", "cancelled"]
    
    # Sample descriptions
    descriptions = [
        "Server maintenance and updates",
        "Weekly team meeting and sprint planning",
        "Bug fixes and performance optimization",
        "Database backup and recovery test",
        "User support and troubleshooting",
        "Documentation update for ISMS compliance",
        "Training on new security tools",
        "Network configuration and monitoring",
        "Code review and refactoring",
        "Security patch deployment",
        "System monitoring and alerting setup",
        "Client requirement analysis",
        "API integration and testing",
        "Infrastructure capacity planning",
        "Incident response and resolution",
    ]
    
    created = 0
    for i in range(count):
        data = {
            "date": random_date(90),
            "time": random_time(),
            "description": f"{random.choice(descriptions)} - Session {i+1}",
            "status": random.choice(statuses),
            "category": random.choice(categories),
            "tags": f"tag{random.randint(1,5)},project{random.randint(1,3)}",
            "estimated_time": f"{random.randint(1,8)}h",
            "actual_time": f"{random.randint(1,8)}h",
            "notes": f"Work session #{i+1} - Completed successfully" if random.random() > 0.3 else "",
        }
        
        # Use form data instead of JSON
        resp = requests.post(f"{BASE_URL}/api/worklog", headers=headers, data=data)
        if resp.status_code == 200:
            created += 1
            print(f"✅ [{created:2d}] {data['date']} | {data['category']:15s} | {data['status']:12s}")
        else:
            print(f"❌ Failed to create worklog {i+1}: {resp.status_code}")
    
    print(f"\n✅ Created {created}/{count} work log entries")
    return created

# ==================== MODULE 2: PROJECT TASKS ====================
def seed_project_tasks(token, headers, count=60):
    """Seed dummy project task entries"""
    print_header("✅ SEEDING PROJECT TASKS MODULE")
    
    statuses = ["todo", "doing", "done"]
    priorities = ["low", "medium", "high"]
    
    assignees = ["Ahmad", "Budi", "Charlie", "David", "Eka", "Fajar", "Gilang", "Hendra"]
    
    titles = [
        "Implement user authentication module",
        "Setup CI/CD pipeline",
        "Database migration to PostgreSQL",
        "API documentation update",
        "Frontend responsive design",
        "Security vulnerability assessment",
        "Performance optimization",
        "Unit test implementation",
        "Code refactoring",
        "Server infrastructure upgrade",
        "Monitoring dashboard creation",
        "Backup automation script",
        "ISMS compliance audit",
        "Client portal development",
        "Mobile app integration",
        "Payment gateway integration",
        "Email notification system",
        "Report generation module",
        "Data export functionality",
        "Admin panel enhancement",
    ]
    
    created = 0
    for i in range(count):
        due = random_date(30, -10)  # Some overdue
        data = {
            "title": f"{random.choice(titles)} #{i+1}",
            "description": f"Task description for item #{i+1}. This task includes various subtasks and requirements.",
            "status": random.choice(statuses),
            "assignee": random.choice(assignees),
            "priority": random.choice(priorities),
            "due_date": due,
            "tags": f"sprint{random.randint(1,5)},feature{random.randint(1,8)}",
            "estimated_hours": str(random.randint(2, 40)),
            "actual_hours": str(random.randint(1, 35)),
        }
        
        # Use form data instead of JSON
        resp = requests.post(f"{BASE_URL}/api/project-tasks", headers=headers, data=data)
        if resp.status_code == 200:
            created += 1
            status_icon = "📋" if data['status'] == 'todo' else "🔄" if data['status'] == 'doing' else "✅"
            print(f"✅ [{created:2d}] {status_icon} {data['priority'].upper():7s} | {data['assignee']:10s} | Due: {due}")
        else:
            print(f"❌ Failed to create task {i+1}: {resp.status_code}")
    
    print(f"\n✅ Created {created}/{count} project tasks")
    return created

# ==================== MODULE 3: LOG DELETION ====================
def seed_log_deletion(token, headers, count=60):
    """Seed dummy log deletion/maintenance entries"""
    print_header("🗑️ SEEDING LOG DELETION MODULE")
    
    servers = [
        "10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5",
        "192.168.1.10", "192.168.1.11", "192.168.1.12",
        "NAS-001", "NAS-002", "NAS-003",
        "WEB-SRV-01", "WEB-SRV-02",
        "DB-SRV-01", "DB-SRV-02",
        "APP-SRV-01", "APP-SRV-02", "APP-SRV-03",
    ]
    
    paths = [
        "/var/log/syslog",
        "/var/log/auth.log",
        "/var/log/apache2/access.log",
        "/var/log/mysql/error.log",
        "/home/user/logs/app.log",
        "/opt/app/logs/debug.log",
        "/var/log/nginx/access.log",
        "/var/log/postgresql/postgresql.log",
    ]
    
    scripts = [
        "cleanup_old_logs.sh",
        "rotate_logs.py",
        "archive_and_delete.sh",
        "log_maintenance.py",
        "auto_cleanup.sh",
    ]
    
    created = 0
    for i in range(count):
        size = random.choice(["100MB", "250MB", "500MB", "1GB", "2GB", "5GB", "10GB"])
        data = {
            "server": random.choice(servers),
            "path": random.choice(paths),
            "script_execution": random.choice(scripts),
            "execution_date": random_date(120),
            "size": size,
            "notes": f"Log cleanup for {random.choice(paths)} - Removed {size}",
        }
        
        # Use form data instead of JSON
        resp = requests.post(f"{BASE_URL}/api/log-maintenance", headers=headers, data=data)
        if resp.status_code == 200:
            created += 1
            print(f"✅ [{created:2d}] {data['server']:15s} | {data['size']:6s} | {data['execution_date']}")
        else:
            print(f"❌ Failed to create log deletion {i+1}: {resp.status_code}")
    
    print(f"\n✅ Created {created}/{count} log deletion entries")
    return created

# ==================== MODULE 4: LOG COMPRESSION ====================
def seed_log_compression(token, headers, count=60):
    """Seed dummy log compression entries"""
    print_header("📦 SEEDING LOG COMPRESSION MODULE")
    
    servers = [
        "10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5",
        "192.168.1.10", "192.168.1.11", "192.168.1.12",
        "NAS-001", "NAS-002", "NAS-003",
        "WEB-SRV-01", "WEB-SRV-02",
        "DB-SRV-01", "DB-SRV-02",
        "APP-SRV-01", "APP-SRV-02", "APP-SRV-03",
    ]
    
    archives = [
        "syslog_202401.tbz2",
        "auth_log_202401.tgz",
        "apache_access_202401.txz",
        "mysql_error_202401.tbz2",
        "app_debug_202401.tgz",
        "nginx_access_202401.txz",
        "postgresql_202401.tbz2",
        "combined_logs_202401.tgz",
    ]
    
    created = 0
    for i in range(count):
        data = {
            "server": random.choice(servers),
            "archive_info": f"{random.choice(archives)}_{i+1:03d}",
            "execution_date": random_date(90),
            "notes": f"Compressed old logs on {random.choice(servers)} - Archive created successfully",
        }
        
        # Use form data instead of JSON
        resp = requests.post(f"{BASE_URL}/api/log-compression", headers=headers, data=data)
        if resp.status_code == 200:
            created += 1
            print(f"✅ [{created:2d}] {data['server']:15s} | {data['archive_info']:30s} | {data['execution_date']}")
        else:
            print(f"❌ Failed to create log compression {i+1}: {resp.status_code}")
    
    print(f"\n✅ Created {created}/{count} log compression entries")
    return created

# ==================== MAIN ====================
def main():
    print()
    print("╔" + "=" * 68 + "╗")
    print("║" + " " * 15 + "SEED DUMMY DATA - LOCKED MODULES" + " " * 19 + "║")
    print("║" + " " * 10 + "Testing Pagination (20 records/page)" + " " * 24 + "║")
    print("╚" + "=" * 68 + "╝")
    
    # Login
    print("\n🔐 Logging in...")
    token = login()
    if not token:
        print("❌ Failed to login. Make sure backend is running on port 8001")
        return
    
    print("✅ Login successful!")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Seed each module
    results = {}
    
    # 1. Work Logs (60 records = 3 pages)
    results['Work Log'] = seed_work_logs(token, headers, count=60)
    
    # 2. Project Tasks (60 records = 3 pages)
    results['Project Tasks'] = seed_project_tasks(token, headers, count=60)
    
    # 3. Log Deletion (60 records = 3 pages)
    results['Log Deletion'] = seed_log_deletion(token, headers, count=60)
    
    # 4. Log Compression (60 records = 3 pages)
    results['Log Compression'] = seed_log_compression(token, headers, count=60)
    
    # Summary
    print()
    print("=" * 70)
    print("  📊 SEEDING SUMMARY")
    print("=" * 70)
    print()
    total = 0
    for module, count in results.items():
        pages = (count + 19) // 20  # Calculate pages
        print(f"  ✅ {module:20s}: {count:3d} records ({pages} pages)")
        total += count
    
    print()
    print(f"  📈 Total records created: {total}")
    print(f"  📄 Each module shows pagination with 20 records/page")
    print()
    print("=" * 70)
    print("  ✅ SEEDING COMPLETED!")
    print("=" * 70)
    print()
    print("  Next steps:")
    print("  1. Open http://localhost:3001")
    print("  2. Navigate to each module")
    print("  3. Verify pagination (Prev/Next buttons)")
    print("  4. Check entry counter (e.g., 'Showing 1-20 of 60')")
    print()

if __name__ == "__main__":
    main()
