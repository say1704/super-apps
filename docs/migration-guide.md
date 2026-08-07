# Encryption Key Migration Guide

## Overview

This guide explains how to migrate the Fernet encryption key in production to fix the "Fernet key must be 32 url-safe base64-encoded bytes" error.

## Background

### The Problem

The application had a bug in the encryption key generation that caused double-encoding:

```python
# BUGGY CODE (double-encoding)
Fernet.generate_key().decode()
```

`Fernet.generate_key()` already returns a base64-encoded 32-byte key (44 characters). Encoding it again creates an invalid key that Fernet cannot use.

### The Impact

- Backend services fail to start with error: `ValueError: Fernet key must be 32 url-safe base64-encoded bytes`
- Encrypted data (asset passwords, credentials) cannot be decrypted
- Application is non-functional

### The Solution

1. Fix the key generation code (already done)
2. Run migration script to:
   - Backup current database and key
   - Decrypt all data with old key
   - Generate new valid key
   - Re-encrypt all data with new key
   - Update database
   - Verify migration success

## Prerequisites

- Backup of the database (created automatically by migration script)
- Access to the production server
- Application stopped or in maintenance mode
- Python 3.12+ with cryptography library installed

## Migration Steps

### Step 1: Stop Services

```bash
cd /opt/super-apps
./stop-all.sh
```

### Step 2: Run Migration Script

```bash
cd /opt/super-apps/backend
source venv/bin/activate
python3 scripts/migrate_encryption_key.py
```

The script will:
1. Create backups in `backend/backups/`
2. Load the old encryption key
3. Attempt to decrypt all encrypted data
4. Generate a new valid Fernet key
5. Re-encrypt all data with the new key
6. Update the database
7. Save the new key to `~/.superapps/encryption.key`
8. Verify all data can be decrypted

**Important:** If some data cannot be decrypted with the old key, the script will warn you and ask for confirmation before proceeding.

### Step 3: Start Services

```bash
cd /opt/super-apps
./start-all.sh
```

### Step 4: Verify Migration

```bash
cd /opt/super-apps/backend
source venv/bin/activate
python3 scripts/verify_encryption.py
```

This script will:
- Load the new encryption key
- Query all encrypted data
- Attempt to decrypt all data
- Report success/failure statistics

Expected output:
```
✓ Verification PASSED!
All encrypted data can be decrypted successfully
```

### Step 5: Test Application

1. Login to the application
2. Navigate to Asset Register
3. Try to view asset passwords
4. Verify all features work correctly

## Rollback Procedure

If the migration fails or causes issues, you can rollback using the backup files.

### Automatic Rollback

```bash
cd /opt/super-apps/backend
./scripts/rollback.sh <timestamp>
```

Example:
```bash
./scripts/rollback.sh 20260720_120000
```

To see available backups:
```bash
./scripts/rollback.sh
```

### Manual Rollback

```bash
# Stop services
cd /opt/super-apps
./stop-all.sh

# Restore database
cp backend/backups/superapps.db.pre-migration.YYYYMMDD_HHMMSS backend/data/superapps.db

# Restore key
cp backend/backups/encryption.key.pre-migration.YYYYMMDD_HHMMSS ~/.superapps/encryption.key

# Start services
./start-all.sh
```

## Backup Files

After migration, backup files are stored in `backend/backups/`:

- `superapps.db.pre-migration.YYYYMMDD_HHMMSS` - Database backup
- `encryption.key.pre-migration.YYYYMMDD_HHMMSS` - Old encryption key

**Important:** Keep these backups for at least 7 days after successful migration.

## Troubleshooting

### Error: "No encryption key found"

**Cause:** The encryption key file doesn't exist at `~/.superapps/encryption.key`

**Solution:**
```bash
# Generate a new key
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" > ~/.superapps/encryption.key
chmod 600 ~/.superapps/encryption.key
```

### Error: "Could not decrypt" for some assets

**Cause:** Some assets were encrypted with a different key or the key is corrupted

**Solution:**
1. Check if you have backups from before the corruption
2. Run migration script and choose to skip undecryptable assets
3. Manually update the affected assets after migration

### Error: "Verification failed" after migration

**Cause:** The new key is invalid or some data was corrupted during migration

**Solution:**
1. Run rollback script immediately
2. Check migration logs for errors
3. Contact support if issue persists

## Best Practices

1. **Always backup before migration** - The migration script does this automatically, but verify backups exist
2. **Test in staging first** - Run migration on a staging environment before production
3. **Schedule maintenance window** - Migration requires stopping services
4. **Keep backups for 7+ days** - In case issues are discovered later
5. **Monitor after migration** - Check logs for any decryption errors

## Files Modified

The following files were fixed to prevent future issues:

1. `backend/utils/password_encrypt.py` - Fixed key generation
2. `start-all.sh` - Fixed key generation
3. `start.sh` - Fixed key generation
4. `backend/start-backend.sh` - Removed hardcoded key
5. `backend/start.sh` - Removed hardcoded key

## Support

If you encounter issues during migration:

1. Check the logs: `pm2 logs backend`
2. Verify backups exist: `ls -la backend/backups/`
3. Run verification script: `python3 scripts/verify_encryption.py`
4. Contact the development team with:
   - Error messages
   - Migration logs
   - Verification results
