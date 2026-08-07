#!/bin/bash
# Generate SSL certificate trusted by local browser using mkcert
# Valid for ~2 years, covers localhost + common development IPs
# Requires mkcert installed: https://github.com/FiloSottile/mkcert

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_DIR/certs"

CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# Find mkcert binary
MKCERT_CMD=""
if command -v mkcert &> /dev/null; then
    MKCERT_CMD="mkcert"
elif [ -f "$HOME/.local/bin/mkcert" ]; then
    MKCERT_CMD="$HOME/.local/bin/mkcert"
elif [ -f "/usr/local/bin/mkcert" ]; then
    MKCERT_CMD="/usr/local/bin/mkcert"
fi

if [ -z "$MKCERT_CMD" ]; then
    echo "ERROR: mkcert not found. Install it:"
    echo "  macOS: brew install mkcert && mkcert -install"
    echo "  Linux: sudo apt install mkcert && mkcert -install"
    echo "  Or download: https://github.com/FiloSottile/mkcert/releases"
    exit 1
fi

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "Certificate already exists at certs/cert.pem"
    echo "To regenerate, delete the files first."
    exit 0
fi

echo "Generating mkcert trusted SSL certificate..."
mkdir -p "$CERT_DIR"

$MKCERT_CMD -key-file "$KEY_FILE" -cert-file "$CERT_FILE" \
    localhost 127.0.0.1 ::1

chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo ""
echo "Certificate generated successfully!"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo ""
echo "This certificate is TRUSTED by your browser (no 'Not Secure' warning)"
