"""Cross-module anomaly engine.

Satu engine, tiap modul = entri registry DETECTORS. Menemukan anomali dengan ml/anomaly.py
(z-score/IQR/IsolationForest ensemble) + aturan ringan, lalu (opsional) LLM lokal menuliskan
narasi Bahasa. Dipanggil on-demand (api/anomaly.py) atau via job harian (app_lifecycle).
"""
from __future__ import annotations

import hashlib
import logging
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from ml.anomaly import AnomalyDetector
from models import (
    AnomalyFinding, SSHLoginLog, CapacityMetrics, VulnerabilityReport,
    IncidentReport, BackupHistory, InventorySnapshot,
)

logger = logging.getLogger(__name__)

BASELINE_DAYS = 30      # jendela membangun deret harian
RECENT_DAYS = 3         # hanya munculkan anomali yang tanggalnya dalam N hari terakhir
MIN_POINTS = 5          # minimal titik data untuk deteksi statistik

# Knob pengembangan (override via config/ai.yaml)
BACKUP_EXPECTED_HOUR = 21    # jam jadwal backup harian (0-23, waktu server/UTC lokal proses)
BACKUP_GRACE_HOURS = 2       # toleransi setelah jadwal sebelum dianggap "tidak jalan"
FORECAST_HORIZON_DAYS = 30   # ambang early-warning kapasitas (hari menuju threshold)

try:
    import yaml as _yaml
    from pathlib import Path as _Path
    _agi_cfg = _yaml.safe_load((_Path(__file__).resolve().parents[1] / "config" / "ai.yaml").read_text()) or {}
    BACKUP_EXPECTED_HOUR = int(_agi_cfg.get("backup_expected_hour", BACKUP_EXPECTED_HOUR))
    BACKUP_GRACE_HOURS = int(_agi_cfg.get("backup_grace_hours", BACKUP_GRACE_HOURS))
    FORECAST_HORIZON_DAYS = int(_agi_cfg.get("forecast_horizon_days", FORECAST_HORIZON_DAYS))
except Exception:
    pass

# module key (untuk finding + panel/registry)
MODULES = ["ssh-report", "capacity", "vulnerability", "backup-analytics", "incident", "inventory"]


# ------------------------------------------------------------------ helpers
def _today() -> date:
    return datetime.now(timezone.utc).date()


def _fingerprint(module: str, entity: str, signal_type: str, period_to: date) -> str:
    raw = f"{module}|{entity}|{signal_type}|{period_to.isoformat()}"
    return hashlib.sha1(raw.encode()).hexdigest()[:24]


def _rec(module, entity, signal_type, severity, score, title, message,
         period_from, period_to, metric_current=None, metric_baseline=None, owner_role=None) -> dict:
    return {
        "module": module, "entity": entity, "signal_type": signal_type,
        "severity": severity, "score": float(score or 0), "title": title, "message": message,
        "metric_current": metric_current, "metric_baseline": metric_baseline,
        "period_from": period_from, "period_to": period_to,
        "owner_role": owner_role,
        "fingerprint": _fingerprint(module, entity or "", signal_type, period_to),
    }


def _series_map(rows: List[tuple], start: date, end: date, gap_fill: bool = False) -> Dict[str, Dict[date, float]]:
    """rows = list of (entity, day:date, value) -> {entity: {day: value}}.

    gap_fill=False (default): hanya hari yang punya baris nyata. Untuk deret PENGUKURAN
    (ukuran backup, %CPU/RAM/disk, jumlah vuln) hari tanpa baris = BELUM diukur, bukan 0 —
    mengisi 0 mencemari baseline & memicu false-positive (mis. backup belum jalan hari ini).
    """
    by_entity: Dict[str, Dict[date, float]] = defaultdict(dict)
    for entity, day, value in rows:
        if entity is None or day is None:
            continue
        by_entity[entity][day] = float(value or 0)
    if gap_fill:
        ndays = (end - start).days
        all_days = [start + timedelta(days=i) for i in range(ndays + 1)]
        for entity, m in by_entity.items():
            for d in all_days:
                m.setdefault(d, 0.0)
    return by_entity


def _recent(d: date) -> bool:
    return d >= _today() - timedelta(days=RECENT_DAYS - 1)


def _sev_from(direction: str, confidence: float) -> str:
    """Petakan hasil deteksi → 4 level. 'spike' (naik) lebih penting dari 'drop' (turun)."""
    if direction == "spike":
        return "critical" if confidence >= 1.0 else "high"
    return "medium" if confidence >= 1.0 else "low"


def _fmt_bytes(n) -> str:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return str(n)
    for u in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024:
            return f"{int(n)} {u}" if u == "B" else f"{n:.2f} {u}"
        n /= 1024
    return f"{n:.2f} PB"


def _fmt_val(v, unit: str) -> str:
    if v is None:
        return "-"
    if unit == "bytes":
        return _fmt_bytes(v)
    if unit == "percent":
        return f"{v:.0f}%"
    return f"{v:.0f}"


_MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def _fmt_date(d: date) -> str:
    return f"{d.day} {_MONTHS_ID[d.month - 1]} {d.year}"


def _context_phrase(cur: float, base: float, direction: str, base_str: str) -> str:
    """Frasa konteks yang rapi & tidak menyesatkan (hindari % saat baseline ~0)."""
    updown = "lebih tinggi" if direction == "spike" else "lebih rendah"
    if base is not None and base >= 1:
        pct = (cur - base) / base * 100
        sign = "+" if pct >= 0 else "−"
        return f"{updown} dari biasanya ({sign}{abs(pct):.0f}%) — normal ≈ {base_str}"
    return f"{updown} tajam dari biasanya yang nyaris nol"


def _detect_series(module: str, metric_label: str, signal_type: str,
                   by_entity: Dict[str, Dict[date, float]], start: date, end: date,
                   owner_by_entity: Optional[Dict[str, str]] = None,
                   only_high: bool = True, unit: str = "count") -> List[dict]:
    out: List[dict] = []
    owner_by_entity = owner_by_entity or {}
    for entity, m in by_entity.items():
        if len(m) < MIN_POINTS:
            continue
        days = sorted(m.keys())
        values = [m[d] for d in days]
        if max(values) == min(values):
            continue  # datar, tak ada anomali
        try:
            res = AnomalyDetector.detect_anomalies(days, values, method="ensemble")
        except Exception as e:
            logger.debug("anomaly detect fail %s/%s: %s", module, entity, e)
            continue
        baseline = sum(values) / len(values) if values else 0
        for a in res.get("anomalies", []):
            adate = a["date"]
            if isinstance(adate, str):
                try:
                    adate = date.fromisoformat(adate[:10])
                except ValueError:
                    continue
            elif isinstance(adate, datetime):
                adate = adate.date()
            elif not isinstance(adate, date):
                continue
            if not _recent(adate):
                continue
            if only_high and a.get("direction") != "spike":
                continue
            direction = a.get("direction", "spike")
            cur_str = _fmt_val(a["size"], unit)
            base_str = _fmt_val(baseline, unit)
            phrase = _context_phrase(a["size"], baseline, direction, base_str)
            out.append(_rec(
                module, entity, signal_type,
                _sev_from(direction, a.get("confidence", 0.67)),
                a.get("confidence", 0.67),
                f"{metric_label} tidak wajar pada {entity}",
                f"{metric_label}: {cur_str} ({_fmt_date(adate)}) — {phrase}.",
                start, adate, metric_current=a["size"], metric_baseline=round(baseline, 1),
                owner_role=owner_by_entity.get(entity),
            ))
    return out


# ------------------------------------------------------------------ detectors
def detect_ssh(db: Session) -> List[dict]:
    end = _today()
    start = end - timedelta(days=BASELINE_DAYS)
    q = (db.query(SSHLoginLog.hostname, SSHLoginLog.scan_date, SSHLoginLog.source_ip,
                  SSHLoginLog.username, SSHLoginLog.status, SSHLoginLog.owner_role)
         .filter(SSHLoginLog.scan_date >= start))
    rows = q.all()
    if not rows:
        return []

    recent_start = end - timedelta(days=RECENT_DAYS - 1)
    owner_by_host: Dict[str, str] = {}
    failed_by_host: Dict[str, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
    ip_seen: Dict[str, Dict[str, date]] = defaultdict(dict)          # host -> {source_ip: first scan_date}
    failed_users_by_host: Dict[str, Counter] = defaultdict(Counter)  # user gagal (recent) per host
    users_by_ip: Dict[tuple, set] = defaultdict(set)                 # (host, source_ip) -> {username} (recent)
    for host, sday, sip, uname, status, owner in rows:
        if host is None or sday is None:
            continue
        owner_by_host.setdefault(host, owner)
        if status == "failed":
            failed_by_host[host][sday] += 1
            if sday >= recent_start and uname:
                failed_users_by_host[host][uname] += 1
        if sip:
            prev = ip_seen[host].get(sip)
            if prev is None or sday < prev:
                ip_seen[host][sip] = sday
            if sday >= recent_start and uname:
                users_by_ip[(host, sip)].add(uname)

    # gap-fill failed series
    ndays = (end - start).days
    all_days = [start + timedelta(days=i) for i in range(ndays + 1)]
    for host, m in failed_by_host.items():
        for d in all_days:
            m.setdefault(d, 0.0)

    findings = _detect_series("ssh-report", "Login gagal (brute-force)", "ssh_bruteforce_spike",
                              failed_by_host, start, end, owner_by_host, only_high=True)
    # Lengkapi brute-force dg user yang paling banyak dicoba
    for f in findings:
        if f["signal_type"] == "ssh_bruteforce_spike":
            top = failed_users_by_host.get(f["entity"], Counter()).most_common(3)
            if top:
                f["message"] += " Pengguna paling sering dicoba: " + ", ".join(f"{u} ({c}×)" for u, c in top) + "."

    # Novelty: source_ip baru di window terbaru yang tak ada di baseline (+ username per IP)
    for host, ips in ip_seen.items():
        new_ips = [ip for ip, first in ips.items() if first >= recent_start]
        if not new_ips:
            continue
        parts = []
        for ip in new_ips[:8]:
            us = sorted(users_by_ip.get((host, ip), set()))
            parts.append(f"{ip}" + (f" (pengguna: {', '.join(us[:3])}{'…' if len(us) > 3 else ''})" if us else ""))
        sev = "high" if len(new_ips) >= 5 else "medium"
        ip_list = "; ".join(parts) + ("; …" if len(new_ips) > 8 else "")
        findings.append(_rec(
            "ssh-report", host, "new_source_ip", sev, 0.7,
            f"Source IP baru mengakses {host}",
            f"{len(new_ips)} source IP baru terdeteksi dalam {RECENT_DAYS} hari terakhir — {ip_list}.",
            recent_start, end, metric_current=len(new_ips), metric_baseline=0,
            owner_role=owner_by_host.get(host),
        ))
    return findings


def detect_capacity(db: Session) -> List[dict]:
    end = _today()
    start = end - timedelta(days=BASELINE_DAYS)
    rows = (db.query(CapacityMetrics.hostname, CapacityMetrics.tanggal,
                     CapacityMetrics.cpu_peak, CapacityMetrics.ram_peak, CapacityMetrics.disk_root_pct)
            .filter(CapacityMetrics.tanggal >= start).all())
    if not rows:
        return []
    out: List[dict] = []
    for label, idx, sig in [("CPU peak", 2, "capacity_cpu_outlier"),
                            ("RAM peak", 3, "capacity_ram_outlier"),
                            ("Pemakaian disk /", 4, "capacity_disk_outlier")]:
        by_host = _series_map([(r[0], r[1], r[idx]) for r in rows], start, end)
        out += _detect_series("capacity", label, sig, by_host, start, end, only_high=True, unit="percent")
    out += detect_capacity_forecast(rows)
    return out


def detect_capacity_forecast(rows) -> List[dict]:
    """Early-warning: proyeksi disk / menuju 90% via regresi (reuse capacity_projection)."""
    try:
        from utils.capacity_projection import calculate_projection
    except Exception:
        return []
    disk_by_host: Dict[str, List[tuple]] = defaultdict(list)
    for host, tgl, _cpu, _ram, disk in rows:
        if host and tgl and disk is not None:
            disk_by_host[host].append((tgl, float(disk)))
    out: List[dict] = []
    for host, series in disk_by_host.items():
        series.sort(key=lambda x: x[0])
        if len(series) < MIN_POINTS:
            continue
        hist = [{"date": d.isoformat(), "use_pct": v} for d, v in series]
        cur = series[-1][1]
        try:
            proj = calculate_projection(hist, cur, "/", threshold=90.0, metric_type="disk")
        except Exception:
            continue
        days = proj.get("days_to_threshold")
        if days is None or days > FORECAST_HORIZON_DAYS:
            continue
        sev = "critical" if days <= 7 else "high"
        rec = proj.get("recommendation") or ""
        out.append(_rec(
            "capacity", host, "capacity_disk_forecast", sev, 0.7,
            f"Disk / diproyeksikan penuh pada {host}",
            f"Disk / kini {cur:.0f}%, diproyeksikan capai 90% dalam ~{days} hari "
            f"(≈ {proj.get('threshold_date') or '-'}). {rec}".strip(),
            series[0][0], _today(), metric_current=cur, metric_baseline=90.0,
        ))
    return out


def detect_vulnerability(db: Session) -> List[dict]:
    end = _today()
    start = end - timedelta(days=BASELINE_DAYS)
    rows = (db.query(VulnerabilityReport.server_ip, VulnerabilityReport.scan_date,
                     VulnerabilityReport.high_count, VulnerabilityReport.owner_role)
            .filter(VulnerabilityReport.scan_date >= start).all())
    if not rows:
        return []
    owner = {r[0]: r[3] for r in rows}
    by_ip = _series_map([(r[0], r[1], r[2]) for r in rows], start, end)
    return _detect_series("vulnerability", "Jumlah temuan kerentanan High", "vuln_high_spike",
                          by_ip, start, end, owner, only_high=True, unit="count")


def detect_backup(db: Session) -> List[dict]:
    """Reuse primitive ml/anomaly atas ukuran backup — sejalan dengan modul Backup Analytics."""
    end = _today()
    start = end - timedelta(days=BASELINE_DAYS)
    rows = (db.query(BackupHistory.server_name, BackupHistory.backup_date,
                     BackupHistory.total_size_bytes, BackupHistory.owner_role)
            .filter(BackupHistory.backup_date >= start).all())
    if not rows:
        return []
    owner = {r[0]: r[3] for r in rows}
    by_srv = _series_map([(r[0], r[1], r[2]) for r in rows], start, end)
    # backup: anomali ukuran naik ATAU turun (turun = mungkin backup gagal/parsial)
    findings = _detect_series("backup-analytics", "Ukuran backup", "backup_size_anomaly",
                              by_srv, start, end, owner, only_high=False, unit="bytes")
    findings += detect_backup_missing(rows, owner, start, end)
    return findings


def detect_backup_missing(rows, owner, start: date, end: date) -> List[dict]:
    """Flag server yang RUTIN backup harian tapi tak ada baris hari ini SETELAH jam jadwal.
    Sadar-jadwal: sebelum BACKUP_EXPECTED_HOUR+grace → diam (job memang belum jalan)."""
    now = datetime.now(timezone.utc)
    if now.hour < (BACKUP_EXPECTED_HOUR + BACKUP_GRACE_HOURS):
        return []  # belum lewat jadwal → jangan menuduh
    days_by_srv: Dict[str, set] = defaultdict(set)
    for srv, day, *_ in rows:
        if srv and day:
            days_by_srv[srv].add(day)
    window = max((end - start).days, 1)
    out: List[dict] = []
    for srv, days in days_by_srv.items():
        # hanya server yang biasanya backup harian (≥60% hari punya baris) & tak ada baris hari ini
        if len(days) >= window * 0.6 and end not in days:
            last = max(days)
            out.append(_rec(
                "backup-analytics", srv, "backup_missing", "high", 0.8,
                f"Backup belum jalan hari ini pada {srv}",
                f"Belum ada backup untuk {_fmt_date(end)} (jadwal ~{BACKUP_EXPECTED_HOUR:02d}:00). "
                f"Backup terakhir: {_fmt_date(last)}.",
                last, end, metric_current=0, metric_baseline=None, owner_role=owner.get(srv),
            ))
    return out


def detect_incident(db: Session) -> List[dict]:
    """Spike jumlah insiden 30 hari terakhir vs 30 hari sebelumnya (pola ai_analytics)."""
    end = _today()
    prev_start = end - timedelta(days=60)
    mid = end - timedelta(days=30)
    rows = db.query(IncidentReport.incident_date).filter(IncidentReport.incident_date >= prev_start).all()
    recent = sum(1 for (d,) in rows if d and d > mid)
    prior = sum(1 for (d,) in rows if d and prev_start <= d <= mid)
    if prior >= 3 and recent > prior * 1.5:
        pct = (recent - prior) / prior * 100
        return [_rec("incident", "all", "incident_spike", "high", 0.8,
                     "Lonjakan insiden",
                     f"Insiden meningkat: {recent} dalam 30 hari terakhir "
                     f"(sebelumnya {prior}, +{pct:.0f}%).",
                     mid, end, metric_current=recent, metric_baseline=prior)]
    return []


def detect_inventory(db: Session) -> List[dict]:
    """Drift inventory: perbandingan 2 snapshot terakhir per host (software/JAR bertambah/hilang banyak)."""
    end = _today()
    start = end - timedelta(days=BASELINE_DAYS)
    snaps = (db.query(InventorySnapshot)
             .filter(InventorySnapshot.collection_date >= start)
             .order_by(InventorySnapshot.hostname, InventorySnapshot.collection_date.desc()).all())
    by_host: Dict[str, List[InventorySnapshot]] = defaultdict(list)
    for s in snaps:
        by_host[s.hostname].append(s)
    out: List[dict] = []
    for host, lst in by_host.items():
        if len(lst) < 2:
            continue
        cur, prev = lst[0], lst[1]
        if not _recent(cur.collection_date):
            continue
        d_sw = (cur.total_software or 0) - (prev.total_software or 0)
        d_jar = (cur.total_jars_running or 0) - (prev.total_jars_running or 0)
        if abs(d_sw) >= 5 or abs(d_jar) >= 3:
            sev = "high" if (abs(d_sw) >= 20 or abs(d_jar) >= 10) else "medium"
            def _sg(n):  # tanda +/− rapi
                return f"+{n}" if n >= 0 else f"−{abs(n)}"
            out.append(_rec(
                "inventory", host, "inventory_drift", sev, 0.6,
                f"Perubahan inventory pada {host}",
                f"Perubahan inventory dibanding {_fmt_date(prev.collection_date)} — "
                f"software {_sg(d_sw)}, JAR {_sg(d_jar)}.",
                prev.collection_date, cur.collection_date,
                metric_current=cur.total_software, metric_baseline=prev.total_software,
                owner_role=cur.owner_role,
            ))
    return out


DETECTORS: Dict[str, Callable[[Session], List[dict]]] = {
    "ssh-report": detect_ssh,
    "capacity": detect_capacity,
    "vulnerability": detect_vulnerability,
    "backup-analytics": detect_backup,
    "incident": detect_incident,
    "inventory": detect_inventory,
}


# ------------------------------------------------------------------ orchestration
def run_module(db: Session, module: str) -> List[dict]:
    fn = DETECTORS.get(module)
    if not fn:
        return []
    try:
        return fn(db)
    except Exception as e:
        logger.warning("anomaly detector %s failed: %s", module, e)
        return []


_SEV_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
_RANK_SEV = {v: k for k, v in _SEV_RANK.items()}


def correlate(records: List[dict]) -> List[dict]:
    """Gabungkan ≥2 sinyal pada host yang sama jadi satu finding berprioritas (host_correlated)."""
    by_host: Dict[str, List[dict]] = defaultdict(list)
    for r in records:
        ent = (r.get("entity") or "").strip().lower()
        if not ent or ent == "all":
            continue
        by_host[ent].append(r)
    out: List[dict] = []
    today = _today()
    for ent, items in by_host.items():
        sigs = {i["signal_type"] for i in items}
        if len(sigs) < 2:
            continue
        max_rank = max(_SEV_RANK.get(i["severity"], 1) for i in items)
        if len(sigs) >= 3:
            max_rank = min(4, max_rank + 1)  # naikkan bila banyak sinyal
        entity_disp = items[0].get("entity")
        owner = next((i.get("owner_role") for i in items if i.get("owner_role")), None)
        modules = sorted({i["module"] for i in items})
        summary = "; ".join(sorted(sigs))
        out.append(_rec(
            "correlation", entity_disp, "host_correlated", _RANK_SEV[max_rank], 0.9,
            f"{len(sigs)} sinyal anomali pada {entity_disp}",
            f"Host {entity_disp} menunjukkan {len(sigs)} jenis anomali ({summary}) "
            f"lintas modul: {', '.join(modules)}. Perlu diperiksa sebagai prioritas.",
            today, today, metric_current=len(sigs), metric_baseline=None, owner_role=owner,
        ))
    return out


def run_all(db: Session) -> List[dict]:
    out: List[dict] = []
    for module in DETECTORS:
        out += run_module(db, module)
    try:
        out += correlate(out)
    except Exception as e:
        logger.warning("correlate failed: %s", e)
    return out


def _is_suppressed(db: Session, r: dict) -> bool:
    """True bila ada aturan suppression aktif (snooze/false-positive) yang cocok."""
    from models import AnomalySuppression
    now = datetime.now(timezone.utc)
    q = db.query(AnomalySuppression).filter(AnomalySuppression.module == r["module"])
    ent = r.get("entity")
    for s in q.all():
        if s.entity and s.entity != ent:
            continue
        if s.signal_type and s.signal_type != r["signal_type"]:
            continue
        if s.until is not None:
            u = s.until
            if u.tzinfo is None:
                u = u.replace(tzinfo=timezone.utc)
            if u < now:
                continue  # kedaluwarsa
        return True
    return False


def persist(db: Session, records: List[dict]) -> List[AnomalyFinding]:
    """Upsert by fingerprint. Yang baru → status open. Return daftar finding yang BARU dibuat.
    Finding yang cocok aturan suppression aktif dilewati (tidak dibuat)."""
    new_findings: List[AnomalyFinding] = []
    for r in records:
        existing = db.query(AnomalyFinding).filter(AnomalyFinding.fingerprint == r["fingerprint"]).first()
        if not existing and _is_suppressed(db, r):
            continue
        if existing:
            existing.severity = r["severity"]
            existing.score = r["score"]
            existing.message = r["message"]
            existing.metric_current = r["metric_current"]
            existing.metric_baseline = r["metric_baseline"]
            continue
        f = AnomalyFinding(
            module=r["module"], entity=r["entity"], signal_type=r["signal_type"],
            severity=r["severity"], score=r["score"], status="open",
            title=r["title"], message=r["message"],
            metric_current=r["metric_current"], metric_baseline=r["metric_baseline"],
            period_from=r["period_from"], period_to=r["period_to"],
            fingerprint=r["fingerprint"], owner_role=r.get("owner_role"),
        )
        db.add(f)
        new_findings.append(f)
    db.commit()
    return new_findings


async def narrate(db: Session, findings: List[AnomalyFinding]) -> None:
    """Isi narrative (Bahasa) untuk finding high/critical via LLM lokal. Hemat: hanya yang penting."""
    important = [f for f in findings if f.severity in ("high", "critical") and not f.narrative]
    if not important:
        return
    try:
        from utils.ai_engine import query_llm
    except Exception:
        return
    for f in important[:20]:  # batasi beban CPU
        prompt = [
            {"role": "system", "content": "Anda analis keamanan/infrastruktur. Jawab ringkas Bahasa Indonesia: "
                                          "1 kalimat arti anomali, lalu 1-2 rekomendasi tindakan. Maksimal 60 kata."},
            {"role": "user", "content": f"Modul: {f.module}. Entity: {f.entity}. Sinyal: {f.signal_type}. "
                                        f"Detail: {f.message}"},
        ]
        try:
            f.narrative = (await query_llm(prompt, max_tokens=160, temperature=0.2)).strip()
        except Exception as e:
            logger.debug("narrate fail %s: %s", f.id, e)
    db.commit()


def run_daily_anomaly_scan(session_factory) -> None:
    """Entry untuk APScheduler (sync). Deteksi semua modul → persist → narasi → notifikasi."""
    import asyncio
    db = session_factory()
    try:
        records = run_all(db)
        new_findings = persist(db, records)
        logger.info("[ANOMALY] scan: %d records, %d baru", len(records), len(new_findings))
        if new_findings:
            try:
                asyncio.run(narrate(db, new_findings))
            except Exception as e:
                logger.debug("narrate batch fail: %s", e)
            _notify(db, new_findings)
    except Exception as e:
        logger.warning("[ANOMALY] daily scan failed: %s", e)
    finally:
        db.close()


def _notify(db: Session, findings: List[AnomalyFinding]) -> None:
    """Notifikasi bell (+SSE) ke superadmin untuk temuan high/critical baru. Gated AppSettings."""
    crit = [f for f in findings if f.severity in ("high", "critical")]
    if not crit:
        return
    try:
        from models import AppSettings, User
        from utils.notification_dispatcher import create_in_app_notification
        row = db.query(AppSettings).filter(AppSettings.key == "anomaly_notify_enabled").first()
        if row and str(row.value).lower() in ("0", "false", "off", "no"):
            return
        admins = db.query(User).filter(User.role == "superadmin").all()
        for f in crit[:10]:
            for admin in admins:
                create_in_app_notification(
                    db=db, user_id=admin.id, notif_type="anomaly_detected",
                    title=f"Anomali: {f.module}",
                    message=(f.title or f.message or "")[:200],
                    link="/modules/anomaly-insights",
                )
    except Exception as e:
        logger.debug("anomaly notify fail: %s", e)
