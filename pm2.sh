#!/usr/bin/env bash
# Wrapper PM2 untuk super-apps — SELALU pakai PM2_HOME project (.pm2 di folder repo),
# bukan ~/.pm2 default. Pakai ini untuk semua perintah pm2 read/kontrol.
#
# Contoh:
#   ./pm2.sh status
#   ./pm2.sh logs
#   ./pm2.sh logs superapps-backend-1
#   ./pm2.sh monit
#   ./pm2.sh restart superapps-frontend
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PM2_HOME="$DIR/.pm2"
exec npx pm2 "$@"
