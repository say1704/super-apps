# SAR Monitoring - Setup Guide

## 📋 Overview

Server Capacity Monitoring menggunakan SAR (System Activity Report) untuk monitoring:
- CPU Usage
- RAM Usage  
- Disk Usage
- Network Bandwidth
- Active Connections

## 🔐 Zero-Trust Authentication

- **Credentials TIDAK disimpan** di database
- Password hanya di **memory** saat SSH session
- Password **dihapus otomatis** setelah selesai
- Setiap session butuh **input credentials ulang**

---

## 🚀 Installation & Setup

### **Step 1: Setup Sudoers di Setiap Server**

Jalankan script ini di **SETIAP server** yang mau dimonitor:

```bash
# Copy script ke server
scp setup_sudoers.sh root@server-01:/tmp/

# Login ke server
ssh root@server-01

# Run script
cd /tmp
chmod +x setup_sudoers.sh
sudo ./setup_sudoers.sh
```

**Script akan:**
1. ✅ Create user `backup_reader` (jika belum ada)
2. ✅ Setup sudoers untuk passwordless sudo
3. ✅ Install sysstat (SAR package)
4. ✅ Enable SAR logging
5. ✅ Test sudo access

---

### **Step 2: Setup Password User**

Set password untuk user `backup_reader`:

```bash
sudo passwd backup_reader
# Enter password: (masukkan password yang aman)
```

**Catat password ini** untuk digunakan di dashboard.

---

### **Step 3: Verify Setup**

Test manual dari PC sysadmin:

```bash
# Test SSH + SAR
ssh backup_reader@server-01 "sudo sar -u -f /var/log/sa/sa$(date +%d)"

# Output yang diharapkan:
# Linux 5.14.0-284.el9.x86_64 (server-01) 	03/12/2026 	_x86_64_	(4 CPU)
# Average:     CPU     %user     %nice   %system   %iowait    %steal     %idle
# Average:     all      15.23      0.00      5.67      0.12      0.00     78.98
```

Jika output muncul → **Setup berhasil!** ✅

---

## 📊 Usage - Dashboard

### **1. Access Dashboard**

```
http://localhost:3001/modules/monthly-server-check
```

### **2. Click "➕ Fetch SAR Data"**

### **3. Fill Form:**

| Field | Value | Description |
|-------|-------|-------------|
| **Server Hostname/IP** | `server-01` or `192.168.1.10` | Server to monitor |
| **SSH Username** | `backup_reader` | User created by script |
| **SSH Password** | (your password) | Password set in Step 2 |
| **SSH Port** | `22` | Default SSH port |
| **SAR Log Directory** | `/var/log/sa` | Default SAR location |

### **4. Click "🚀 Fetch SAR Data"**

Dashboard akan show:
- ✅ Server status (OK/Warning/Critical)
- ✅ CPU, RAM, Disk usage dengan progress bars
- ✅ Alert reasons jika warning/critical

---

## 🔧 Troubleshooting

### **Error: "user NOT in sudoers"**

**Solusi:** Script setup_sudoers.sh belum dijalankan atau gagal.

```bash
# Re-run script
sudo ./setup_sudoers.sh

# Manual check
sudo cat /etc/sudoers.d/backup_reader
# Harus ada: backup_reader ALL=(ALL) NOPASSWD: /usr/bin/sar
```

---

### **Error: "Cannot open /var/log/sa/sa12"**

**Solusi:** SAR log belum ada atau permission salah.

```bash
# Check SAR log exists
ls -la /var/log/sa/

# Enable SAR logging
sudo systemctl enable sysstat
sudo systemctl start sysstat

# Generate SAR data (tunggu besok ada data)
# atau generate manual
sudo sar -u 1 5 > /dev/null
```

---

### **Error: "sar: command not found"**

**Solusi:** Sysstat belum installed.

```bash
# Rocky/CentOS
sudo dnf install -y sysstat

# Ubuntu/Debian
sudo apt-get install -y sysstat
```

---

### **Error: "Connection refused" atau "Authentication failed"**

**Solusi:** SSH credentials salah atau server unreachable.

```bash
# Test SSH manual
ssh backup_reader@server-01

# Test dengan password
sshpass -p 'YOUR_PASSWORD' ssh backup_reader@server-01 "echo test"
```

---

## 📁 File Locations

| File | Location | Purpose |
|------|----------|---------|
| **Setup Script** | `/opt/super-apps/backend/scripts/setup_sudoers.sh` | Automated setup |
| **Sudoers** | `/etc/sudoers.d/backup_reader` | Sudo configuration |
| **SAR Logs** | `/var/log/sa/saDD` | Daily SAR data |
| **Backend API** | `/api/capacity-planning/fetch` | SAR fetch endpoint |

---

## 🔒 Security Best Practices

1. **Gunakan password yang kuat** untuk `backup_reader`
2. **Rotate password** secara berkala (setiap 90 hari)
3. **Limit sudo access** hanya untuk command yang diperlukan
4. **Monitor activity logs** untuk audit trail
5. **Gunakan SSH key** (optional, untuk automation)

---

## 📞 Support

Jika ada masalah:
1. Check log: `/var/log/syslog` atau `/var/log/messages`
2. Test manual: `sudo sar -u -f /var/log/sa/saDD`
3. Verify sudoers: `sudo visudo -c -f /etc/sudoers.d/backup_reader`

---

**Last Updated:** March 12, 2026  
**Version:** 1.0
