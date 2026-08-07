#!/bin/bash
# Run all tests (backend + frontend)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  Super Apps - Test Suite"
echo "========================================="

# Backend tests
echo ""
echo "=== Backend Tests ==="
cd "$PROJECT_DIR/backend"
ENABLE_SUDO_MODE=true ./venv/bin/python -m pytest tests/ -v --tb=short
echo "Backend tests passed!"

# Frontend type check
echo ""
echo "=== Frontend Type Check ==="
cd "$PROJECT_DIR/frontend"
npx tsc --noEmit
echo "TypeScript check passed!"

echo ""
echo "========================================="
echo "  All Tests Passed!"
echo "========================================="
