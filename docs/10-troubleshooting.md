# Troubleshooting Guide

## 1. Database Issues

### "database is locked" error

**Cause**: Concurrent writes dari multiple workers.

**Solution**: WAL mode sudah aktif, tapi jika masih terjadi, restart workers:
```bash
pm2 restart backend
```

**Prevention**: Retry logic di application layer (max 3x).

### Database corruption

**Symptoms**: FastAPI error 500, SQLite "database disk image is malformed".

**Solution**: Restore dari backup terbaru:
```bash
bash stop-all.sh
cp backend/backups/app.db.XXXXXX backend/app.db
bash start-all.sh
```

**Verifikasi**:
```bash
sqlite3 backend/app.db "PRAGMA integrity_check;"
```

### Migration failed

**Symptoms**: Alembic error saat startup.

**Solution**: Cek versi migration, rollback jika perlu:
```bash
source .venv/bin/activate
cd backend
alembic history          # lihat history
alembic downgrade -1     # rollback 1 step
alembic upgrade head     # coba lagi
```

**Note**: Pastikan backup DB sebelum migration.

### WAL file grows too large

**Symptoms**: `app.db-wal` file > 1GB.

**Solution**: Force checkpoint:
```bash
sqlite3 backend/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

**Prevention**: Auto-checkpoint setiap 1000 writes.

---

## 2. AI Model Issues

### Model failed to load

**Symptoms**: AI chat return error, model-server crash loop.

**Solution**:
- Cek path model di `config/ai.yaml`
- Pastikan file .gguf ada dan tidak corrupt
- Restart model server: `pm2 restart model-server`

**Memory**: Pastikan RAM cukup (light: 2GB, heavy: 6GB, total: ~8GB).

### Model inference timeout

**Symptoms**: AI response hang, timeout setelah 60 detik.

**Solution**:
- Heavy model (7B) untuk complex task — bisa lambat di CPU
- Cek CPU usage: `htop` atau `pm2 monit`
- Pertimbangkan upgrade hardware atau GPU
- Timeout handling di frontend (retry dengan simpler query)

### Token overflow

**Symptoms**: AI response terpotong, error "context length exceeded".

**Solution**:
- Model context 8192 tokens — cukup untuk kebanyakan percakapan
- Conversation memory dipangkas (last 10 messages)
- RAG context di-ringkas sebelum dikirim

### Embedding mismatch

**Symptoms**: RAG tidak menemukan dokumen relevan.

**Solution**: Re-index knowledge base via admin panel.

**Prevention**: Update embeddings setelah perubahan data besar.

---

## 3. SSL Issues

### Certificate expired

**Symptoms**: Browser warning "NET::ERR_CERT_DATE_INVALID".

**Solution**: Regenerate certificate:
```bash
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1
pm2 restart frontend
```

### Certificate not trusted

**Symptoms**: Browser warning "NET::ERR_CERT_AUTHORITY_INVALID".

**Solution**: Install local CA:
```bash
mkcert -install
```
Restart browser.

### Port 3443 already in use

**Symptoms**: Frontend gagal start.

**Solution**: Cek proses yang menggunakan port:
```bash
lsof -i :3443
kill -9 <PID>    # atau stop service lain
pm2 restart frontend
```

---

## 4. PM2 Issues

### Process stuck in "stopped" status

**Solution**: Force delete dan restart:
```bash
pm2 delete frontend
pm2 start ecosystem.config.js --only frontend
```

### Memory leak (backend worker)

**Symptoms**: Backend worker memory terus naik, restart otomatis.

**Solution**:
- Cek max memory limit di ecosystem.config.js (4GB)
- Monitor: `pm2 monit`
- Restart worker: `pm2 restart backend`
- Jika persistent, aktifkan max memory restart:
  ```bash
  pm2 restart backend --max-memory-restart 3G
  ```

### PM2 log disk full

**Symptoms**: Disk usage 100%.

**Solution**:
```bash
pm2 flush                  # clear all logs
pm2 reset all              # reset counters
```

**Prevention**: Set log rotation di PM2:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
```

---

## 5. Frontend Issues

### Blank page (white screen)

**Symptoms**: Halaman kosong, tidak ada error.

**Solution**:
- Cek browser console untuk JavaScript errors
- Clear browser cache (hard reload: Ctrl+Shift+R)
- Cek API response di Network tab
- Restart frontend: `pm2 restart frontend`

### API 401 (Unauthorized)

**Symptoms**: Request gagal dengan 401.

**Solution**:
- Cookie `access_token` expired — login ulang
- Cek browser cookie
- Jika API dipanggil dari Postman, set header `Authorization: Bearer <token>`

### API 429 (Too Many Requests)

**Symptoms**: Rate limited.

**Solution**: Tunggu 1 menit (rate limit reset per menit).

**Jika urgent**: Restart frontend server (reset rate limiter).

### Admin UI /admin-ui 401

**Symptoms**: `/admin-ui` return 401.

**Solution**:
- Login dulu ke aplikasi utama (dapatkan JWT token)
- Cek cookie `access_token` atau `__Secure-access_token`
- Jika sudah login tapi tetap 401, token mungkin expired

---

## 6. Port Conflicts

### Port 8001-8005 already in use

**Solution**:
```bash
for port in 8001 8002 8003 8004 8005; do
  pid=$(lsof -ti :$port)
  if [ -n "$pid" ]; then kill -9 $pid; fi
done
pm2 start ecosystem.config.js --only backend
```

---

## 7. Development Issues

### Hot reload not working

**Solution**: Restart dev server: `Ctrl+C` → `bash start.sh` again.

### Dependency conflict

**Solution**: Recreate virtual environment:
```bash
deactivate
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Migration not detected (Alembic)

**Solution**:
```bash
alembic check          # cek apakah ada perubahan
alembic revision --autogenerate -m "description"
alembic upgrade head
```

---

## 8. Performance Issues

### Slow page load

**Cause**: Large dataset tanpa pagination.

**Solution**:
- Pastikan pagination aktif (default 20 items/page)
- Gunakan search/filter untuk mempersempit data
- Cek query time di backend logs

### High CPU usage

**Cause**: AI model inference.

**Solution**:
- AI model biasanya high CPU saat query pertama (cold start)
- Setelah warm, response lebih cepat
- Pertimbangkan GPU untuk production

### High memory usage

**Solution**:
- Set memory limits di PM2
- Pantau dengan `pm2 monit` atau `htop`
- Restart service jika memory > 80% limit

---

## Health Check Endpoints

```bash
# Backend health
curl http://127.0.0.1:8001/health

# Model server health
curl http://127.0.0.1:8081/health

# Frontend (via server.js)
curl -k https://localhost:3443/api/health

# Admin UI health
curl -k https://localhost:3443/admin-ui/
```

## Debugging Commands

### PM2
```bash
pm2 list                # status semua service
pm2 logs backend        # real-time backend logs
pm2 logs --lines 200    # last 200 lines all services
pm2 monit               # interactive monitor
```

### Database
```bash
sqlite3 backend/app.db "SELECT * FROM users;"
sqlite3 backend/app.db "PRAGMA integrity_check;"
```

### Network
```bash
lsof -i :8001-8005      # cek port usage
netstat -tlnp | grep 3443  # cek SSL port
```

### System
```bash
htop                    # real-time CPU/memory
df -h                   # disk usage
du -sh backend/app.db*  # database file size
```
