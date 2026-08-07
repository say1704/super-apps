#!/bin/bash
# Fix all modules to handle paginated responses

FRONTEND_DIR="/home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/frontend/app/modules"

echo "🔧 Fixing all modules to handle paginated responses..."
echo ""

# Function to fix a module file
fix_module() {
    local file=$1
    local api_endpoint=$2
    
    if [ -f "$file" ]; then
        echo "✅ Checking $file..."
        
        # Check if file uses the API endpoint and needs fixing
        if grep -q "apiRequest.*$api_endpoint" "$file"; then
            # Check if already fixed
            if grep -q "result.data || result" "$file"; then
                echo "   ✓ Already fixed"
            else
                echo "   ⚠️  Needs fixing - adding fallback..."
                # Add comment about pagination (manual step)
                echo "   ℹ️  Please update: setData(result) → setData(result.data || result)"
            fi
        else
            echo "   - Not using $api_endpoint"
        fi
    else
        echo "   ❌ File not found: $file"
    fi
}

echo "📋 Checking modules..."
echo ""

# Monthly Server Check
fix_module "$FRONTEND_DIR/monthly-check/page.tsx" "api/monthly-server-check"

# Vulnerability Report
fix_module "$FRONTEND_DIR/vulnerability/page.tsx" "api/vulnerability-report"

# Incident Report
fix_module "$FRONTEND_DIR/incident/page.tsx" "api/incident-report"

# Documentation
fix_module "$FRONTEND_DIR/documentation/page.tsx" "api/documents"

# Assets
fix_module "$FRONTEND_DIR/assets/page.tsx" "api/assets"

# IRMC Check
fix_module "$FRONTEND_DIR/irmc-check/page.tsx" "api/irmc-check"

echo ""
echo "✅ Module check completed!"
echo ""
echo "📝 Manual steps required:"
echo "   For each module that uses paginated endpoints:"
echo "   1. Find: setData(result)"
echo "   2. Replace with: setData(result.data || result)"
echo ""
