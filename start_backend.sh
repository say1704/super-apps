#!/bin/bash
cd /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/backend
exec venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001 --ssl-certfile /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/certs/cert.pem --ssl-keyfile /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/certs/key.pem
