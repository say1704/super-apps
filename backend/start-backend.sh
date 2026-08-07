#!/bin/bash
# Start backend server with correct environment variables
# ASSET_ENCRYPTION_KEY / SECRET_KEY are auto-loaded from backend/.superapps/
# (see utils/key_manager.py). Do NOT hardcode secrets in this committed file.

cd "$(dirname "$0")"
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
