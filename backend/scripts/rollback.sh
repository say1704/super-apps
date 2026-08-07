#!/bin/bash
# Rollback script untuk restore database dan encryption key dari backup
#
# Usage:
#   ./scripts/rollback.sh [backup_timestamp]
#
# Example:
#   ./scripts/rollback.sh 20260720_120000
#
# If no timestamp is provided, it will list available backups

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║              Super Apps - Rollback Script                 ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Error: Backup directory not found at $BACKUP_DIR${NC}"
    exit 1
fi

# List available backups if no timestamp provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Available backups:${NC}"
    echo ""
    
    # List database backups
    echo "Database backups:"
    ls -1 "$BACKUP_DIR"/superapps.db.pre-migration.* 2>/dev/null | while read -r file; do
        timestamp=$(basename "$file" | sed 's/superapps.db.pre-migration.//')
        size=$(du -h "$file" | cut -f1)
        echo "  $timestamp ($size)"
    done
    
    echo ""
    echo "Key backups:"
    ls -1 "$BACKUP_DIR"/encryption.key.pre-migration.* 2>/dev/null | while read -r file; do
        timestamp=$(basename "$file" | sed 's/encryption.key.pre-migration.//')
        echo "  $timestamp"
    done
    
    echo ""
    echo -e "${YELLOW}Usage: ./scripts/rollback.sh <timestamp>${NC}"
    echo "Example: ./scripts/rollback.sh 20260720_120000"
    exit 0
fi

TIMESTAMP="$1"

# Check if backups exist
DB_BACKUP="$BACKUP_DIR/superapps.db.pre-migration.$TIMESTAMP"
KEY_BACKUP="$BACKUP_DIR/encryption.key.pre-migration.$TIMESTAMP"

if [ ! -f "$DB_BACKUP" ]; then
    echo -e "${RED}Error: Database backup not found for timestamp $TIMESTAMP${NC}"
    echo "Expected: $DB_BACKUP"
    exit 1
fi

if [ ! -f "$KEY_BACKUP" ]; then
    echo -e "${YELLOW}Warning: Key backup not found for timestamp $TIMESTAMP${NC}"
    echo "Only database will be restored"
fi

# Confirm rollback
echo -e "${YELLOW}You are about to rollback to backup from: $TIMESTAMP${NC}"
echo ""
echo "This will:"
echo "  1. Stop all services"
echo "  2. Restore database from backup"
if [ -f "$KEY_BACKUP" ]; then
    echo "  3. Restore encryption key from backup"
fi
echo "  4. Restart services"
echo ""
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled"
    exit 0
fi

# Step 1: Stop services
echo ""
echo -e "${YELLOW}[Step 1/4] Stopping services...${NC}"
cd "$SCRIPT_DIR/.."
if [ -f "stop-all.sh" ]; then
    ./stop-all.sh
else
    echo "Warning: stop-all.sh not found, services may still be running"
fi

# Step 2: Restore database
echo ""
echo -e "${YELLOW}[Step 2/4] Restoring database...${NC}"
DB_PATH="$SCRIPT_DIR/../backend/data/superapps.db"

if [ -f "$DB_PATH" ]; then
    # Create backup of current database
    CURRENT_BACKUP="$BACKUP_DIR/superapps.db.pre-rollback.$(date +%Y%m%d_%H%M%S)"
    cp "$DB_PATH" "$CURRENT_BACKUP"
    echo "Current database backed up to: $CURRENT_BACKUP"
fi

cp "$DB_BACKUP" "$DB_PATH"
echo -e "${GREEN}✓ Database restored from: $DB_BACKUP${NC}"

# Step 3: Restore key (if exists)
if [ -f "$KEY_BACKUP" ]; then
    echo ""
    echo -e "${YELLOW}[Step 3/4] Restoring encryption key...${NC}"
    KEY_PATH="$HOME/.superapps/encryption.key"
    
    if [ -f "$KEY_PATH" ]; then
        # Backup current key
        CURRENT_KEY_BACKUP="$BACKUP_DIR/encryption.key.pre-rollback.$(date +%Y%m%d_%H%M%S)"
        cp "$KEY_PATH" "$CURRENT_KEY_BACKUP"
        echo "Current key backed up to: $CURRENT_KEY_BACKUP"
    fi
    
    mkdir -p "$(dirname "$KEY_PATH")"
    cp "$KEY_BACKUP" "$KEY_PATH"
    chmod 600 "$KEY_PATH"
    echo -e "${GREEN}✓ Encryption key restored from: $KEY_BACKUP${NC}"
else
    echo ""
    echo -e "${YELLOW}[Step 3/4] Skipping key restoration (no backup found)${NC}"
fi

# Step 4: Start services
echo ""
echo -e "${YELLOW}[Step 4/4] Starting services...${NC}"
if [ -f "start-all.sh" ]; then
    ./start-all.sh
else
    echo "Warning: start-all.sh not found, please start services manually"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Rollback Completed Successfully!             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Please verify that the application is working correctly"
echo ""
