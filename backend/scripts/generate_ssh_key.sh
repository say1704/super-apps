#!/bin/bash
#
# Generate SSH Key Pair for SAR Monitoring
#
# Usage: ./generate_ssh_key.sh
#
# Output:
#   - backup_reader_key (private key)
#   - backup_reader_key.pub (public key)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SSH Key Generation for SAR Monitoring${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if keys already exist
if [ -f "backup_reader_key" ] || [ -f "backup_reader_key.pub" ]; then
    echo -e "${YELLOW}Warning: SSH keys already exist!${NC}"
    read -p "Do you want to overwrite them? (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo -e "${YELLOW}Aborted.${NC}"
        exit 0
    fi
    rm -f backup_reader_key backup_reader_key.pub
    echo -e "${GREEN}✓ Old keys removed${NC}"
fi

# Generate ED25519 key (more secure than RSA)
echo -e "${YELLOW}Generating ED25519 SSH key pair...${NC}"
ssh-keygen -t ed25519 \
    -f "backup_reader_key" \
    -C "backup_reader@super-apps-sar-monitoring" \
    -N "" \
    -q

echo -e "${GREEN}✓ SSH key pair generated${NC}"
echo ""

# Set correct permissions
chmod 600 backup_reader_key
chmod 644 backup_reader_key.pub

# Display public key
echo -e "${YELLOW}Public Key (backup_reader_key.pub):${NC}"
echo "─────────────────────────────────────────────────"
cat backup_reader_key.pub
echo "─────────────────────────────────────────────────"
echo ""

# Instructions
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Next Steps:${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "1. Copy the PUBLIC key above (backup_reader_key.pub)"
echo ""
echo "2. Deploy to ALL servers using Ansible:"
echo "   ansible-playbook -i hosts.ini setup_sar_ansible.yml \\"
echo "     --extra-vars \"ssh_public_key='$(cat backup_reader_key.pub)'\""
echo ""
echo "3. Or deploy manually to each server:"
echo "   ssh root@server-01 \"mkdir -p /home/backup_reader/.ssh && cat backup_reader_key.pub >> /home/backup_reader/.ssh/authorized_keys && chown -R backup_reader:backup_reader /home/backup_reader/.ssh && chmod 700 /home/backup_reader/.ssh && chmod 600 /home/backup_reader/.ssh/authorized_keys\""
echo ""
echo "4. Test SSH connection:"
echo "   ssh -i backup_reader_key backup_reader@server-01"
echo ""
echo "5. Upload PRIVATE key (backup_reader_key) to dashboard when fetching SAR data"
echo ""
echo -e "${YELLOW}⚠️  SECURITY WARNING:${NC}"
echo "   - Keep PRIVATE key (backup_reader_key) SECURE!"
echo "   - NEVER share or commit to git!"
echo "   - Add to .gitignore"
echo ""

# Add to .gitignore if not already
if ! grep -q "backup_reader_key" .gitignore 2>/dev/null; then
    echo "backup_reader_key" >> .gitignore
    echo "backup_reader_key.pub" >> .gitignore
    echo -e "${GREEN}✓ Added keys to .gitignore${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
