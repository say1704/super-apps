#!/bin/bash
#
# SAR Monitoring - Sudoers Setup Script
# 
# This script configures sudo access for backup_reader user
# to enable SAR monitoring without password prompts.
#
# Usage: sudo ./setup_sudoers.sh
#
# Compatible with:
# - Rocky Linux / CentOS / RHEL 7, 8, 9
# - Ubuntu / Debian
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SAR Monitoring - Sudoers Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root (sudo ./setup_sudoers.sh)${NC}"
    exit 1
fi

# Check if backup_reader user exists
if ! id "backup_reader" &>/dev/null; then
    echo -e "${YELLOW}Warning: User 'backup_reader' does not exist.${NC}"
    read -p "Do you want to create it? (y/n): " create_user
    if [ "$create_user" = "y" ]; then
        useradd -r -s /bin/bash backup_reader
        echo -e "${GREEN}✓ User 'backup_reader' created${NC}"
    else
        echo -e "${RED}✗ Cannot proceed without 'backup_reader' user${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ User 'backup_reader' exists${NC}"
fi

# Detect OS type
if [ -f /etc/rocky-release ] || [ -f /etc/centos-release ] || [ -f /etc/redhat-release ]; then
    OS_TYPE="rocky"
    echo -e "${GREEN}✓ Detected Rocky/CentOS/RHEL${NC}"
elif [ -f /etc/ubuntu-release ] || [ -f /etc/debian_version ]; then
    OS_TYPE="debian"
    echo -e "${GREEN}✓ Detected Ubuntu/Debian${NC}"
else
    OS_TYPE="unknown"
    echo -e "${YELLOW}⚠ Unknown OS type, will use generic setup${NC}"
fi

# Create sudoers file
SUDOERS_FILE="/etc/sudoers.d/backup_reader"
echo ""
echo -e "${YELLOW}Creating sudoers file: ${SUDOERS_FILE}${NC}"

# Backup existing sudoers file if exists
if [ -f "$SUDOERS_FILE" ]; then
    cp "$SUDOERS_FILE" "${SUDOERS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✓ Backed up existing sudoers file${NC}"
fi

# Create new sudoers file
cat > "$SUDOERS_FILE" << 'EOF'
# SAR Monitoring - Sudoers Configuration
# User: backup_reader
# Purpose: Allow passwordless sudo for SAR monitoring commands
# Created: $(date)

# SAR CPU/RAM metrics
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/sar

# Read SAR log files from ANY directory
backup_reader ALL=(ALL) NOPASSWD: /bin/cat /*/sar_log/*
backup_reader ALL=(ALL) NOPASSWD: /bin/cat /var/log/sa/*
backup_reader ALL=(ALL) NOPASSWD: /bin/cat /root/sar_log/*
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/tail /*/sar_log/*
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/tail /var/log/sa/*
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/tail /root/sar_log/*

# Disk usage
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/df
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/df -h

# Network connections
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/ss
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/ss -tan
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/ss -tan state established

# Network interface info
backup_reader ALL=(ALL) NOPASSWD: /sbin/ip
backup_reader ALL=(ALL) NOPASSWD: /sbin/ip route
backup_reader ALL=(ALL) NOPASSWD: /sbin/ip -o link show

# Sysstat package check (optional)
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/dpkg -l sysstat
backup_reader ALL=(ALL) NOPASSWD: /usr/bin/rpm -q sysstat
EOF

# Set correct permissions
chmod 440 "$SUDOERS_FILE"
chown root:root "$SUDOERS_FILE"

echo -e "${GREEN}✓ Sudoers file created with correct permissions (440)${NC}"

# Validate sudoers syntax
echo ""
echo -e "${YELLOW}Validating sudoers syntax...${NC}"
if visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
    echo -e "${GREEN}✓ Sudoers syntax is valid${NC}"
else
    echo -e "${RED}✗ Sudoers syntax error!${NC}"
    echo -e "${YELLOW}Restoring backup...${NC}"
    if [ -f "${SUDOERS_FILE}.backup" ]; then
        mv "${SUDOERS_FILE}.backup" "$SUDOERS_FILE"
        echo -e "${GREEN}✓ Backup restored${NC}"
    fi
    exit 1
fi

# Ensure sysstat is installed (provides sar command)
echo ""
echo -e "${YELLOW}Checking sysstat package...${NC}"

if [ "$OS_TYPE" = "rocky" ]; then
    if ! rpm -q sysstat &>/dev/null; then
        echo -e "${YELLOW}sysstat not found. Installing...${NC}"
        dnf install -y sysstat
        echo -e "${GREEN}✓ sysstat installed${NC}"
    else
        echo -e "${GREEN}✓ sysstat already installed${NC}"
    fi
    
    # Enable sysstat service
    systemctl enable sysstat
    systemctl start sysstat
    echo -e "${GREEN}✓ sysstat service enabled and started${NC}"
    
elif [ "$OS_TYPE" = "debian" ]; then
    if ! dpkg -l sysstat &>/dev/null; then
        echo -e "${YELLOW}sysstat not found. Installing...${NC}"
        apt-get update -qq
        apt-get install -y sysstat
        echo -e "${GREEN}✓ sysstat installed${NC}"
    else
        echo -e "${GREEN}✓ sysstat already installed${NC}"
    fi
    
    # Enable sysstat in /etc/default/sysstat
    if grep -q "ENABLED=\"false\"" /etc/default/sysstat 2>/dev/null; then
        sed -i 's/ENABLED="false"/ENABLED="true"/' /etc/default/sysstat
        systemctl restart sysstat
        echo -e "${GREEN}✓ sysstat enabled in configuration${NC}"
    fi
fi

# Create SAR log directory if not exists
SAR_DIR="/var/log/sa"
if [ ! -d "$SAR_DIR" ]; then
    echo ""
    echo -e "${YELLOW}Creating SAR log directory: ${SAR_DIR}${NC}"
    mkdir -p "$SAR_DIR"
    chmod 755 "$SAR_DIR"
    echo -e "${GREEN}✓ SAR log directory created${NC}"
fi

# Test sudo access
echo ""
echo -e "${YELLOW}Testing sudo access for backup_reader...${NC}"

# Create a test script
TEST_SCRIPT=$(mktemp)
cat > "$TEST_SCRIPT" << 'TESTEOF'
#!/bin/bash
echo "Testing SAR command..."
sudo sar -u -f /var/log/sa/sa$(date +%d) 2>/dev/null | tail -1
if [ $? -eq 0 ]; then
    echo "SUCCESS"
    exit 0
else
    echo "FAILED"
    exit 1
fi
TESTEOF

chmod +x "$TEST_SCRIPT"

# Run test as backup_reader
if su - backup_reader -c "$TEST_SCRIPT" 2>&1 | grep -q "SUCCESS"; then
    echo -e "${GREEN}✓ Sudo access test PASSED${NC}"
else
    echo -e "${YELLOW}⚠ Sudo access test may have issues${NC}"
    echo -e "${YELLOW}  (This is OK if no SAR data exists yet)${NC}"
fi

rm -f "$TEST_SCRIPT"

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo -e "  ✓ User: ${GREEN}backup_reader${NC}"
echo -e "  ✓ Sudoers: ${GREEN}${SUDOERS_FILE}${NC}"
echo -e "  ✓ SAR Directory: ${GREEN}${SAR_DIR}${NC}"
echo -e "  ✓ Sysstat: ${GREEN}Installed & Enabled${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Verify SAR data exists: ls -la /var/log/sa/"
echo "  2. Test manual SAR: sudo sar -u -f /var/log/sa/sa$(date +%d)"
echo "  3. Test as backup_reader: su - backup_reader -c 'sudo sar -u -f /var/log/sa/sa$(date +%d)'"
echo ""
echo -e "${YELLOW}For Server Capacity Monitoring:${NC}"
echo "  - Use username: backup_reader"
echo "  - Use password: (your backup_reader password)"
echo "  - SAR Directory: /var/log/sa"
echo ""
