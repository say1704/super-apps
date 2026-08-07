# 🚀 Ansible Deployment Guide - SAR Monitoring

## 📋 Prerequisites

1. **Ansible installed** on control machine
2. **SSH access** to all target servers (as root or sudo user)
3. **Inventory file** with server list

---

## 🔧 Quick Start

### **1. Edit Inventory File**

```bash
cd /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/backend/scripts

# Edit hosts.ini
vi hosts.ini
```

Add your servers:
```ini
[all_servers]
server-01    ansible_host=192.168.1.10
server-02    ansible_host=192.168.1.11
server-03    ansible_host=192.168.1.12
# Add all your servers...
```

---

### **2. Set Password**

Edit playbook and change password:

```bash
vi setup_sar_ansible.yml
```

Change line:
```yaml
sar_password: "<CHANGE_ME>"  # ⚠️ CHANGE THIS!
```

**⚠️ IMPORTANT:** Use a strong password!

---

### **3. Test Connection**

```bash
# Test SSH connection to all servers
ansible all_servers -i hosts.ini -m ping

# Expected output:
# server-01 | SUCCESS => { ... "ping": "pong" }
# server-02 | SUCCESS => { ... "ping": "pong" }
```

---

### **4. Run Playbook**

```bash
# Dry run (test mode - no changes)
ansible-playbook -i hosts.ini setup_sar_ansible.yml --check

# Actual deployment
ansible-playbook -i hosts.ini setup_sar_ansible.yml
```

---

## 📊 Deployment Output

You will see:
```
PLAY [Setup SAR Monitoring on All Servers] ************************************

TASK [Gathering Facts] ********************************************************
ok: [server-01]
ok: [server-02]
ok: [server-03]

TASK [Print setup info] *******************************************************
ok: [server-01] => { "msg": "Setting up SAR monitoring for server-01" }
ok: [server-02] => { "msg": "Setting up SAR monitoring for server-02" }

TASK [Create backup_reader user] **********************************************
changed: [server-01]
changed: [server-02]
changed: [server-03]

TASK [Install sysstat] ********************************************************
ok: [server-01]
ok: [server-02]
ok: [server-03]

... (more tasks)

PLAY RECAP ********************************************************************
server-01                  : ok=10   changed=3   unreachable=0    failed=0
server-02                  : ok=10   changed=3   unreachable=0    failed=0
server-03                  : ok=10   changed=3   unreachable=0    failed=0
```

**✅ SUCCESS** if all servers show `failed=0`

---

## 🔍 Verify Deployment

### **Check One Server Manually:**

```bash
# SSH to server
ssh root@server-01

# Check user exists
id backup_reader
# Output: uid=991(backup_reader) gid=991(backup_reader) ...

# Check sudoers
cat /etc/sudoers.d/backup_reader
# Should show SAR commands with NOPASSWD

# Test SAR
su - backup_reader -c "sudo sar -u -f /var/log/sa/sa$(date +%d)"
# Should show CPU metrics
```

---

## 🎯 Advanced Usage

### **Deploy to Specific Group:**

```bash
# Only production servers
ansible-playbook -i hosts.ini setup_sar_ansible.yml --limit production

# Only datacenter 1
ansible-playbook -i hosts.ini setup_sar_ansible.yml --limit datacenter_1
```

---

### **Deploy with SSH Key (More Secure):**

```bash
# Use SSH key instead of password
ansible-playbook -i hosts.ini setup_sar_ansible.yml --private-key ~/.ssh/id_rsa

# Or specify SSH user
ansible-playbook -i hosts.ini setup_sar_ansible.yml -u ansible_user
```

---

### **Parallel Execution (Faster for Many Servers):**

```bash
# Run on 20 servers in parallel
ansible-playbook -i hosts.ini setup_sar_ansible.yml --forks 20

# Default is 5 servers parallel
```

---

## 📈 Large Scale Deployment (100+ Servers)

### **1. Use SSH ControlPersist (Faster Connections):**

Create `~/.ansible.cfg`:
```ini
[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

### **2. Use Fact Caching:**

```ini
[defaults]
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_facts
fact_caching_timeout = 86400
```

### **3. Run in Batches:**

```bash
# Deploy to 50 servers at a time
ansible-playbook -i hosts.ini setup_sar_ansible.yml --batch-size 50
```

---

## 🔒 Security Best Practices

### **1. Use Ansible Vault for Passwords:**

```bash
# Encrypt password
ansible-vault encrypt_string 'YourSecurePassword123!' --name 'sar_password'

# Copy encrypted output to playbook
# Then run with:
ansible-playbook -i hosts.ini setup_sar_ansible.yml --ask-vault-pass
```

### **2. Use SSH Keys Instead of Password:**

```bash
# Generate SSH key for backup_reader
ssh-keygen -t ed25519 -f backup_reader_key

# Deploy public key to all servers
ansible all_servers -i hosts.ini -m authorized_key \
  -a "user=backup_reader key={{ lookup('file', 'backup_reader_key.pub') }}"
```

### **3. Rotate Passwords Regularly:**

```bash
# Create password rotation playbook
cat > rotate_passwords.yml << EOF
- name: Rotate backup_reader Password
  hosts: all_servers
  become: yes
  tasks:
    - name: Generate new password
      set_fact:
        new_password: "{{ lookup('password', '/dev/null length=16 chars=ascii_letters,digits') }}"
    
    - name: Update password
      user:
        name: backup_reader
        password: "{{ new_password | password_hash('sha512') }}"
        update_password: always
EOF

# Run rotation
ansible-playbook -i hosts.ini rotate_passwords.yml
```

---

## 🐛 Troubleshooting

### **Error: "Unreachable"**

```bash
# Check SSH connectivity
ansible all_servers -i hosts.ini -m ping -vvv

# Check firewall
ansible all_servers -i hosts.ini -a "systemctl status firewalld"
```

### **Error: "Authentication Failed"**

```bash
# Test SSH manually
ssh root@server-01

# Or with SSH key
ansible-playbook -i hosts.ini setup_sar_ansible.yml --private-key ~/.ssh/id_rsa
```

### **Error: "Failed to validate sudoers"**

```bash
# Check syntax manually
ansible all_servers -i hosts.ini -a "visudo -c -f /etc/sudoers.d/backup_reader"
```

---

## 📊 Post-Deployment

### **1. Test Dashboard:**

Access: http://localhost:3001/modules/monthly-server-check

Click "➕ Fetch SAR Data" and test with:
- **Server:** server-01
- **Username:** backup_reader
- **Password:** (password you set)
- **SAR Dir:** /var/log/sa

### **2. Monitor All Servers:**

Add all servers one by one to dashboard, or create bulk import script.

---

## 📞 Support

For issues:
1. Check Ansible logs: `ansible-playbook ... -vvv` (verbose mode)
2. Check server logs: `/var/log/ansible.log`
3. Test manual: `ssh backup_reader@server "sudo sar -u"`

---

**Last Updated:** March 12, 2026  
**Version:** 1.0
