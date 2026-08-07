#!/bin/bash
# Harden PM2 dump file permissions
# Prevents group-readable secrets (SECRET_KEY, ASSET_ENCRYPTION_KEY)

DUMP_FILE="${HOME}/.pm2/dump.pm2"

if [ -f "$DUMP_FILE" ]; then
    chmod 600 "$DUMP_FILE"
    echo "✓ PM2 dump permissions set to 600: $DUMP_FILE"
else
    echo "⚠ PM2 dump file not found: $DUMP_FILE"
fi

# Verify .superapps secrets
SECRET_KEY="${HOME}/Workspace/01_Projects/IT_Projects/2026/super-apps/backend/.superapps/secret.key"
ENCRYPTION_KEY="${HOME}/Workspace/01_Projects/IT_Projects/2026/super-apps/backend/.superapps/encryption.key"

for keyfile in "$SECRET_KEY" "$ENCRYPTION_KEY"; do
    if [ -f "$keyfile" ]; then
        perms=$(stat -c %a "$keyfile" 2>/dev/null || stat -f %Lp "$keyfile" 2>/dev/null)
        if [ "$perms" != "600" ]; then
            chmod 600 "$keyfile"
            echo "✓ Fixed permissions for $keyfile"
        else
            echo "✓ $keyfile already 600"
        fi
    fi
done
