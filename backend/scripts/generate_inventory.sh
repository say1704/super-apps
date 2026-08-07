#!/bin/bash
#
# Generate Ansible Inventory from IP List
#
# Usage: ./generate_inventory.sh ip_list.txt
#
# Input: ip_list.txt (one IP per line)
# Output: hosts.ini (Ansible inventory)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check input file
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide IP list file${NC}"
    echo "Usage: $0 ip_list.txt"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="hosts.ini"

if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}Error: File '$INPUT_FILE' not found${NC}"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Generating Ansible Inventory${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Count IPs
IP_COUNT=$(grep -v '^#' "$INPUT_FILE" | grep -v '^$' | wc -l)
echo -e "${YELLOW}Found $IP_COUNT IPs in $INPUT_FILE${NC}"
echo ""

# Generate inventory
cat > "$OUTPUT_FILE" << 'HEADER'
# ===========================================
# ANSIBLE INVENTORY - Auto-Generated
# ===========================================
# Generated: TIMESTAMP
# Source: INPUT_FILE
# Total Servers: IP_COUNT
# ===========================================

[all_servers]
HEADER

# Replace placeholders
sed -i "s/TIMESTAMP/$(date)/" "$OUTPUT_FILE"
sed -i "s|INPUT_FILE|$INPUT_FILE|" "$OUTPUT_FILE"
sed -i "s/IP_COUNT/$IP_COUNT/" "$OUTPUT_FILE"

# Add IPs
counter=1
while IFS= read -r ip; do
    # Skip comments and empty lines
    [[ "$ip" =~ ^#.*$ ]] && continue
    [[ -z "$ip" ]] && continue
    
    # Generate server name
    server_name="server-$(printf "%03d" $counter)"
    
    # Add to inventory
    echo "$server_name    ansible_host=$ip" >> "$OUTPUT_FILE"
    
    ((counter++))
done < "$INPUT_FILE"

# Add group definitions
cat >> "$OUTPUT_FILE" << 'FOOTER'

# ===========================================
# GROUP BY IP RANGE (Optional)
# ===========================================
# Example:
# [subnet_192_168_1]
# server-001
# server-002
# ===========================================

[all_servers:vars]
ansible_user=root
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
FOOTER

echo -e "${GREEN}✓ Inventory generated: $OUTPUT_FILE${NC}"
echo ""
echo -e "${YELLOW}Preview (first 20 lines):${NC}"
echo "─────────────────────────────────────"
head -20 "$OUTPUT_FILE"
echo "─────────────────────────────────────"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Review: cat $OUTPUT_FILE"
echo "  2. Test: ansible all_servers -i $OUTPUT_FILE -m ping"
echo "  3. Deploy: ansible-playbook -i $OUTPUT_FILE setup_sar_ansible.yml"
echo ""
