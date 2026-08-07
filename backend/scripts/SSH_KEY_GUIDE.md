# 🔐 SSH Key Authentication - Quick Start Guide

## 📋 Overview

**SSH Key Authentication** adalah cara **PALING SECURE** untuk akses server tanpa simpan password!

**Keuntungan:**
- ✅ **TIDAK PERLU simpan password** di Super Apps
- ✅ **TIDAK PERLU input password** setiap kali fetch SAR
- ✅ **Lebih secure** dari password (ED25519 encryption)
- ✅ **Zero-Trust**: Private key hanya di browser, tidak disimpan

---

## 🚀 Quick Setup (5 Minutes)

### **Step 1: Generate SSH Key Pair**

```bash
cd /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/backend/scripts

# Make script executable
chmod +x generate_ssh_key.sh

# Generate key pair
./generate_ssh_key.sh
```

**Output:**
```
✓ SSH key pair generated
- backup_reader_key (private key)
- backup_reader_key.pub (public key)
```

---

### **Step 2: Deploy Public Key ke Semua Server**

**Option A: Pakai Ansible (Recommended untuk banyak server)**

```bash
# Copy public key
PUBLIC_KEY=$(cat backup_reader_key.pub)

# Deploy ke SEMUA server sekaligus
ansible all_servers -i hosts.ini -m authorized_key \
  -a "user=backup_reader key='$PUBLIC_KEY'"
```

**Option B: Manual (untuk sedikit server)**

```bash
# Untuk setiap server
for server in server-01 server-02 server-03; do
    ssh root@$server "mkdir -p /home/backup_reader/.ssh"
    cat backup_reader_key.pub | ssh root@$server \
      "cat >> /home/backup_reader/.ssh/authorized_keys"
    ssh root@$server \
      "chown -R backup_reader:backup_reader /home/backup_reader/.ssh && \
       chmod 700 /home/backup_reader/.ssh && \
       chmod 600 /home/backup_reader/.ssh/authorized_keys"
done
```

---

### **Step 3: Test SSH Connection**

```bash
# Test manual
ssh -i backup_reader_key backup_reader@server-01 "sudo sar -u -f /var/log/sa/sa$(date +%d)"

# Jika berhasil → Output SAR akan muncul
```

---

### **Step 4: Use in Dashboard**

1. **Access Dashboard:**
   ```
   http://localhost:3001/modules/monthly-server-check
   ```

2. **Click "➕ Fetch SAR Data"**

3. **Select "🔐 SSH Key (Recommended)"**

4. **Fill Form:**
   - **Server Hostname/IP:** `server-01`
   - **SSH Username:** `backup_reader`
   - **SSH Private Key:** (Copy-paste isi file `backup_reader_key`)
   - **SAR Directory:** `/var/log/sa`

5. **Click "🚀 Fetch SAR Data"**

**Done!** ✅ Tidak perlu password lagi!

---

## 📁 File Management

### **Private Key (backup_reader_key):**

**⚠️ SANGAT PENTING - JANGAN SAMPAI HILANG!**

- Simpan di tempat **AMAN** dan **TERENKRIPSI**
- **JANGAN** commit ke Git (sudah ada di .gitignore)
- **JANGAN** share ke siapapun
- Backup ke **password manager** atau **encrypted USB**

### **Public Key (backup_reader_key.pub):**

- **BOLEH** di-share ke semua server
- **TIDAK** perlu dijaga kerahasiaannya
- Bisa di-deploy ke unlimited servers

---

## 🔒 Security Best Practices

### **1. Protect Private Key:**

```bash
# Set correct permissions
chmod 600 backup_reader_key

# Encrypt dengan passphrase (optional, lebih secure)
ssh-keygen -p -f backup_reader_key
```

### **2. Rotate Keys Periodically:**

```bash
# Generate new key pair every 90 days
./generate_ssh_key.sh

# Deploy new public key
ansible all_servers -i hosts.ini -m authorized_key \
  -a "user=backup_reader key='$(cat backup_reader_key.pub)'"

# Revoke old keys (remove old authorized_keys)
ansible all_servers -i hosts.ini -a \
  "rm /home/backup_reader/.ssh/authorized_keys"
```

### **3. Monitor Usage:**

Check SSH logs di server:
```bash
# Check who logged in with SSH key
sudo grep "backup_reader" /var/log/secure | tail -20

# Check failed attempts
sudo grep "Failed" /var/log/secure | tail -20
```

---

## 🐛 Troubleshooting

### **Error: "Permission denied (publickey)"**

**Solusi:**
```bash
# Check permissions di server
ssh root@server-01 "ls -la /home/backup_reader/.ssh/"
# Harus: authorized_keys = 600, .ssh directory = 700

# Fix permissions
ssh root@server-01 "
  chmod 700 /home/backup_reader/.ssh &&
  chmod 600 /home/backup_reader/.ssh/authorized_keys &&
  chown -R backup_reader:backup_reader /home/backup_reader/.ssh
"
```

---

### **Error: "Key upload failed"**

**Solusi:**
```bash
# Test manual upload
cat backup_reader_key.pub | ssh root@server-01 \
  "cat >> /home/backup_reader/.ssh/authorized_keys"

# Verify
ssh root@server-01 "cat /home/backup_reader/.ssh/authorized_keys"
```

---

### **Error: "Private key has wrong permissions"**

**Solusi:**
```bash
# Fix local permissions
chmod 600 backup_reader_key
```

---

## 📊 Comparison: Password vs SSH Key

| Feature | Password Auth | SSH Key Auth |
|---------|--------------|--------------|
| **Security** | ⚠️ Medium | ✅ **High** |
| **Convenience** | ❌ Input every time | ✅ **One-time setup** |
| **Zero-Trust** | ⚠️ Password in memory | ✅ **Key in memory (encrypted)** |
| **Brute Force** | ❌ Vulnerable | ✅ **Immune** |
| **Phishing** | ❌ Vulnerable | ✅ **Immune** |
| **Audit Trail** | ⚠️ Hard to track | ✅ **Per-key tracking** |

---

## 🎯 Next Steps

After setup:

1. ✅ **Test dashboard** dengan SSH key
2. ✅ **Backup private key** ke tempat aman
3. ✅ **Document** key rotation schedule
4. ✅ **Monitor** SSH logs untuk suspicious activity

---

**Last Updated:** March 12, 2026  
**Version:** 1.0

**Support:** Check `DEPLOYMENT.md` untuk detailed guide
