#!/bin/bash
# Super Apps - Generate SBOM (CycloneDX)
# Produces CycloneDX JSON SBOM for backend (Python) and frontend (npm)
# into security/sbom/.
#
# Usage: ./scripts/security/sbom.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SBOM_DIR="$PROJECT_DIR/security/sbom"
PYTHON="$BACKEND_DIR/.venv/bin/python"

mkdir -p "$SBOM_DIR"

echo "=== Backend SBOM (CycloneDX) ==="
if [ -x "$BACKEND_DIR/.venv/bin/cyclonedx-py" ]; then
  "$BACKEND_DIR/.venv/bin/cyclonedx-py" environment "$BACKEND_DIR/.venv/bin/python" \
    --output-reproducible --of json -o "$SBOM_DIR/superapps-backend-sbom.json"
  echo "  -> security/sbom/superapps-backend-sbom.json"
else
  echo "  WARN: cyclonedx-bom not installed (pip install cyclonedx-bom)"
fi

echo "=== Frontend SBOM (CycloneDX) ==="
if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
  (cd "$FRONTEND_DIR" && npx --yes @cyclonedx/cyclonedx-npm@6.0.0 \
    --output-format JSON --output-file "$SBOM_DIR/superapps-frontend-sbom.json" \
    --ignore-npm-errors)
  echo "  -> security/sbom/superapps-frontend-sbom.json"
else
  echo "  WARN: package-lock.json missing"
fi

echo "Done."
