#!/bin/bash

echo "🛡️  Creating backups before Log Management refactoring..."
echo ""

cd /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps

# Get timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup database
cp backend/superapps.db backend/superapps.db.backup.$TIMESTAMP
echo "✅ Database backed up: superapps.db.backup.$TIMESTAMP"

# Backup main.py
cp backend/main.py backend/main.py.backup.$TIMESTAMP
echo "✅ backend/main.py backed up: main.py.backup.$TIMESTAMP"

# Backup models.py
cp backend/models.py backend/models.py.backup.$TIMESTAMP
echo "✅ backend/models.py backed up: models.py.backup.$TIMESTAMP"

# Backup frontend modules
cp -r frontend/app/modules frontend/app/modules.backup.$TIMESTAMP
echo "✅ frontend/app/modules backed up: modules.backup.$TIMESTAMP"

echo ""
echo "📦 All backups created successfully!"
echo ""
echo "Backup files:"
ls -lh backend/superapps.db.backup.$TIMESTAMP
ls -lh backend/main.py.backup.$TIMESTAMP
ls -lh backend/models.py.backup.$TIMESTAMP
ls -d frontend/app/modules.backup.$TIMESTAMP

echo ""
echo "✅ Backup completed! Safe to proceed with changes."
