"""
AI Embedder — Sentence-transformer embedding layer for hybrid classification.
Layer 2 between Rules (keyword) and LLM fallback.
Gracefully degrades if sentence-transformers is not installed.
"""
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Threshold: skip LLM fallback jika cosine similarity >= value
EMBED_CONFIDENCE = 0.65

_EMBEDDER_READY = False
_EMBEDDER_URL = None
_example_embeddings: Dict[str, "np.ndarray"] = {}
_example_counts: Dict[str, int] = {}  # jumlah contoh per modul (untuk weighted average)
ROUTE_EXAMPLES: Dict[str, List[str]] = {}  # live: _BASE_EXAMPLES + wordlist + accumulated

_BASE_AI = Path(__file__).parent.parent / "data" / "ai"
WORDLIST_DIR = _BASE_AI / "wordlist"


def _resolve_embedder_url() -> str:
    global _EMBEDDER_URL
    if _EMBEDDER_URL:
        return _EMBEDDER_URL
    url = os.environ.get("MODEL_SERVER_URL", "")
    if url:
        _EMBEDDER_URL = url.rstrip("/") + "/v1/embeddings"
        return _EMBEDDER_URL
    config_file = Path(__file__).parent.parent / "config" / "ai.yaml"
    try:
        import yaml
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
        if cfg and cfg.get("model_server_url"):
            _EMBEDDER_URL = cfg["model_server_url"].rstrip("/") + "/v1/embeddings"
            return _EMBEDDER_URL
    except Exception:
        pass
    _EMBEDDER_URL = "https://127.0.0.1:8081/v1/embeddings"
    return _EMBEDDER_URL


def _embed_batch(texts: List[str]):
    """Encode texts via model server /v1/embeddings, return 2D numpy array."""
    import numpy as np
    import httpx
    url = _resolve_embedder_url()
    api_key = os.environ.get("MODEL_SERVER_API_KEY", "")
    headers = {"X-API-Key": api_key} if api_key else {}
    try:
        resp = httpx.post(url, json={"input": texts}, timeout=30.0, verify=False, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return np.array([item["embedding"] for item in data["data"]])
    except Exception as e:
        logger.warning("Embedding HTTP call failed: %s", e)
        raise


def _load_embedder_config():
    config_file = Path(__file__).parent.parent / "config" / "ai.yaml"
    try:
        import yaml
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
    except Exception:
        return

    global EMBED_CONFIDENCE
    if cfg.get("embed_confidence"):
        EMBED_CONFIDENCE = float(cfg["embed_confidence"])

_load_embedder_config()

# Default base examples (fallback kalau wordlist tidak ada)
_BASE_EXAMPLES: Dict[str, List[str]] = {
    "asset_common": [
        "tampilkan semua asset", "daftar aset perusahaan",
        "list aset yang terdaftar", "data asset", "lihat aset",
        "sebutkan asset register yang terdaftar apa saja",
        "berapa total asset di register", "hitung jumlah aset",
        "total aset terdaftar", "aset apa saja yang ada",
        "tampilkan aset server", "cari aset",
    ],
    "asset_software": [
        "daftar software", "aplikasi apa saja", "list software",
        "software terdaftar", "aplikasi perusahaan",
        "berapa total software", "hitung jumlah aplikasi",
        "software apa saja yang dipakai", "data lisensi software",
        "tambah software baru",
    ],
    "asset_hardware": [
        "daftar hardware", "server apa saja", "list hardware",
        "perangkat keras", "desktop dan laptop",
        "berapa banyak server", "hitung jumlah hardware",
        "tampilkan hardware server", "data perangkat keras",
        "daftar laptop dan desktop",
    ],
    "incident_report": [
        "lihat insiden", "daftar laporan gangguan",
        "incident report", "kejadian apa saja", "laporan insiden",
        "berapa total insiden", "hitung jumlah laporan gangguan",
        "insiden terbaru", "laporan kejadian hari ini",
        "tambah laporan insiden baru",
    ],
    "vulnerability_report": [
        "daftar vulnerability", "hasil scan", "laporan kerentanan",
        "vulnerability scan", "celah keamanan",
        "berapa total vulnerability", "scan terakhir",
        "hasil scan kerentanan", "daftar celah keamanan",
        "tambah hasil scan baru",
    ],
    "users": [
        "daftar pengguna", "list user", "siapa saja user",
        "data pengguna", "akun yang terdaftar",
        "berapa total pengguna", "hitung jumlah user",
        "pengguna aktif", "daftar akun",
        "tambah pengguna baru",
    ],
    "isu_matrix": [
        "matrix isu", "daftar isu", "risk matrix",
        "isu dan risiko", "matrix risiko",
        "berapa total isu", "hitung jumlah risiko",
        "daftar isu terkini", "risk register",
        "tambah isu baru",
    ],
    "penilaian_risiko": [
        "penilaian risiko", "hasil scoring", "nilai risiko",
        "assessment risiko", "daftar penilaian",
        "berapa banyak penilaian", "hitung jumlah scoring",
        "hasil penilaian risiko", "daftar assessment",
        "tambah penilaian baru",
    ],
    "peluang": [
        "daftar peluang", "opportunity", "peluang apa saja",
        "data peluang", "list opportunity",
        "berapa total peluang", "hitung jumlah opportunity",
        "peluang yang tersedia", "daftar kesempatan",
        "tambah peluang baru",
    ],
    "quality_objectives": [
        "sasaran mutu", "quality objectives", "target mutu",
        "daftar sasaran", "objektif kualitas",
        "berapa total sasaran mutu", "hitung jumlah target",
        "sasaran mutu tahun ini", "data kualitas",
        "tambah sasaran mutu baru",
    ],
    "backup_history": [
        "riwayat backup", "daftar backup", "backup terakhir",
        "history backup", "data backup",
        "berapa total backup", "hitung jumlah backup",
        "backup hari ini", "riwayat pencadangan",
        "status backup terbaru",
    ],
    "capacity_metrics": [
        "kapasitas server", "capacity metrics", "penggunaan cpu",
        "memory server", "daftar kapasitas",
        "berapa total metrik", "hitung jumlah capacity",
        "penggunaan cpu server", "kapasitas penyimpanan",
        "data metrik terbaru",
    ],
    "project_tasks": [
        "daftar task", "project tasks", "tugas proyek",
        "list tugas", "task apa saja",
        "berapa total task", "hitung jumlah tugas",
        "tugas yang selesai", "daftar pekerjaan",
        "tambah task baru",
    ],
    "work_log": [
        "work log", "timesheet", "log pekerjaan",
        "daftar worklog", "catatan kerja",
        "berapa total worklog", "hitung log kerja",
        "log pekerjaan hari ini", "timesheet terbaru",
        "tambah catatan kerja baru",
    ],
    "activity_log": [
        "aktivitas terbaru", "activity log", "riwayat aktivitas",
        "log aktivitas", "daftar aktivitas",
        "berapa total aktivitas", "hitung log kegiatan",
        "aktivitas hari ini", "riwayat kegiatan user",
        "cari aktivitas",
    ],
    "ssh_login_logs": [
        "log ssh", "riwayat login", "daftar ssh login",
        "login log", "akses ssh",
        "berapa total login ssh", "hitung jumlah akses ssh",
        "login terakhir", "riwayat akses server",
        "daftar login hari ini",
    ],
    "documents": [
        "daftar dokumen", "document list", "data dokumen",
        "dokumentasi", "cari dokumen",
        "berapa total dokumen", "hitung jumlah dokumen",
        "dokumen terbaru", "daftar file dokumentasi",
        "unggah dokumen baru",
    ],
    "log_maintenance": [
        "log maintenance", "riwayat maintenance", "daftar maintenance",
        "maintenance log", "data perawatan",
        "berapa total maintenance", "hitung log perawatan",
        "maintenance terakhir", "riwayat perbaikan",
        "daftar log pemeliharaan",
    ],
    "notifications": [
        "notifikasi", "daftar notif", "notifikasi saya",
        "pemberitahuan", "list notifikasi",
        "berapa total notifikasi", "hitung jumlah notifikasi",
        "notifikasi belum dibaca", "pemberitahuan terbaru",
        "cek notifikasi",
    ],
    "irmc_check": [
        "hasil irmc", "daftar irmc", "cek irmc",
        "irmc check", "status irmc",
        "berapa total pengecekan irmc", "hitung cek irmc",
        "hasil cek irmc terbaru", "status server irmc",
        "daftar pengecekan irmc",
    ],
    "monthly_server_check": [
        "cek bulanan server", "monthly check", "laporan bulanan",
        "daftar monthly check", "hasil cek bulanan",
        "berapa total monthly check", "hitung cek bulanan",
        "cek server bulan ini", "laporan bulan lalu",
        "daftar pengecekan bulanan",
    ],
    "irmc_folders": [
        "folder irmc", "daftar folder irmc", "list folder",
        "data folder irmc",
        "berapa total folder irmc", "daftar direktori irmc",
        "folder management irmc",
    ],
    "form_uploads": [
        "form upload", "daftar form", "upload form",
        "data form upload", "list form",
        "berapa total form upload", "hitung form yang diupload",
        "upload terbaru", "daftar file upload",
    ],
    "form_types": [
        "tipe form", "jenis form", "daftar tipe form",
        "kategori form", "list form type",
        "berapa jenis form", "daftar kategori upload",
        "macam macam form",
    ],
    "log_compression": [
        "log compression", "kompresi log", "daftar kompresi",
        "riwayat kompresi", "data compression",
        "berapa total kompresi", "hitung log compression",
        "kompresi terakhir", "daftar file terkompresi",
    ],
    "disk_partitions": [
        "partisi disk", "daftar partisi", "disk partition",
        "penggunaan disk", "kapasitas partisi",
        "berapa total partisi", "hitung jumlah partisi",
        "partisi server", "penggunaan storage",
    ],
    "sprints": [
        "daftar sprint", "sprint apa saja", "list sprint",
        "data sprint", "sprint terbaru",
        "berapa total sprint", "hitung jumlah sprint",
        "sprint berjalan", "daftar sprint project",
        "tambah sprint baru",
    ],
    "configuration_items": [
        "configuration item", "ci list", "daftar konfigurasi item",
        "data ci", "item konfigurasi",
        "berapa total ci", "hitung configuration item",
        "daftar aset konfigurasi", "ci management",
    ],
    "document_library": [
        "library dokumen", "sop library", "daftar instruksi",
        "document library", "pustaka dokumen",
        "berapa total dokumen library", "hitung dokumen sop",
        "daftar sop dan instruksi", "cari dokumen library",
    ],
    "document_categories": [
        "kategori dokumen", "daftar kategori", "jenis dokumen",
        "kategori dokumentasi",
        "berapa total kategori", "macam kategori dokumen",
        "daftar jenis dokumentasi",
    ],
    "risk_assessment_forms": [
        "risk assessment", "form penilaian risiko", "daftar assessment",
        "assessment risiko", "form risk",
        "berapa total assessment", "hitung risk assessment",
        "hasil assessment terbaru", "daftar form risiko",
        "tambah assessment baru",
    ],
}


def load_embedder(force: bool = False):
    """Load embedder.
    Startup (force=False): base + wordlist .txt (~760) + accumulated → fast (~5s).
    Retrain  (force=True) : + template queries (~17k) dari ai_wordlist → full centroid.

    Embedding model is on the dedicated model server (/v1/embeddings).
    This function loads wordlists and precomputes centroids via HTTP.
    """
    global _EMBEDDER_READY, ROUTE_EXAMPLES
    if _EMBEDDER_READY and not force:
        return
    try:
        import numpy as np  # noqa: F401
        ROUTE_EXAMPLES.clear()
        ROUTE_EXAMPLES.update(_BASE_EXAMPLES)
        _load_wordlist_examples()
        if force:
            _load_template_examples()
        _precompute_embeddings()
        _EMBEDDER_READY = True
        count = _load_accumulated_examples()
        logger.info("Embedder ready (%d routes, %d accumulated examples)",
                     len(_example_embeddings), count)
    except ImportError:
        logger.warning("numpy not installed; embedding disabled")
    except Exception as e:
        logger.warning("Embedder load failed: %s", e)


def _precompute_embeddings():
    import numpy as np
    if not ROUTE_EXAMPLES:
        return
    all_texts = []
    indices = []
    for modul, examples in ROUTE_EXAMPLES.items():
        start = len(all_texts)
        all_texts.extend(examples)
        indices.append((modul, start, len(all_texts)))
    embeddings = _embed_batch(all_texts)
    for modul, start, end in indices:
        emb = embeddings[start:end]
        _example_embeddings[modul] = np.mean(emb, axis=0)
        _example_counts[modul] = end - start


def _module_from_filename(filename: str) -> str:
    return Path(filename).stem  # filename .txt = module key, 1:1


def _load_wordlist_examples():
    """Baca semua file .txt dari WORDLIST_DIR dan merge ke ROUTE_EXAMPLES."""
    if not WORDLIST_DIR.is_dir():
        logger.warning("Wordlist dir not found: %s", WORDLIST_DIR)
        return
    txt_files = sorted(WORDLIST_DIR.glob("*.txt"))
    total = 0
    for fp in txt_files:
        modul = _module_from_filename(fp.name)
        lines = _parse_wordlist_file(fp)
        if modul in ROUTE_EXAMPLES:
            # merge: tambahkan yang belum ada
            existing = set(ROUTE_EXAMPLES[modul])
            new = [l for l in lines if l not in existing]
            ROUTE_EXAMPLES[modul].extend(new)
        else:
            ROUTE_EXAMPLES[modul] = lines
        total += len(lines)
        logger.debug("Wordlist %s: %d queries for module %s", fp.name, len(lines), modul)
    if total:
        logger.info("Loaded %d wordlist queries from %d files", total, len(txt_files))


def _parse_wordlist_file(fp: Path) -> List[str]:
    """Parse satu file wordlist .txt: skip baris komentar (#) dan kosong, trim."""
    lines = []
    for raw in fp.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return lines


def _load_template_examples():
    """Generate template queries dari ai_wordlist dan merge ke ROUTE_EXAMPLES.
    Dipanggil hanya saat retrain (force=True) — ~17k queries, encoding ~60 detik."""
    try:
        from utils.ai_wordlist import generate_all
        generated = generate_all()
    except Exception as e:
        logger.warning("Template generation skipped: %s", e)
        return
    total = 0
    for modul, queries in generated.items():
        if modul in ROUTE_EXAMPLES:
            existing = set(ROUTE_EXAMPLES[modul])
            new = [q for q in queries if q not in existing]
            ROUTE_EXAMPLES[modul].extend(new)
        else:
            ROUTE_EXAMPLES[modul] = queries
        total += len(queries)
        logger.debug("Templates %s: %d queries", modul, len(queries))
    if total:
        logger.info("Merged %d template-generated queries from ai_wordlist (%d modules)",
                     total, len(generated))


def _load_accumulated_examples(days: int = 30, min_confidence: float = 0.65) -> int:
    """Merge accumulated examples dari persistent volume ke centroid in-memory.
    Container-friendly: baca dari volume, gak nulis file kode."""
    from utils.ai_learn import accumulate_examples
    accumulated = accumulate_examples(days=days, min_confidence=min_confidence)
    total = 0
    for modul, queries in accumulated.items():
        for q in queries:
            add_example(modul, q)
            total += 1
    if total:
        logger.info("Merged %d accumulated examples from volume", total)
    return total


def match(query: str) -> Tuple[Optional[str], float]:
    """Return (best_modul, cosine_similarity) or (None, 0.0)."""
    import numpy as np
    if not _EMBEDDER_READY:
        return None, 0.0
    try:
        q_vec = _embed_batch([query])[0]
    except Exception as e:
        logger.warning("Embedding encode failed: %s", e)
        return None, 0.0

    best_modul = None
    best_score = 0.0
    for modul, centroid in _example_embeddings.items():
        sim = float(np.dot(q_vec, centroid))
        if sim > best_score:
            best_score = sim
            best_modul = modul
    return best_modul, best_score


def add_example(modul: str, query: str):
    """Online update centroid untuk satu modul dengan query baru (in-memory)."""
    import numpy as np
    if not _EMBEDDER_READY or modul not in _example_embeddings:
        return
    try:
        q_vec = _embed_batch([query])[0]
    except Exception:
        return
    old = _example_embeddings[modul]
    count = _example_counts.get(modul, len(_BASE_EXAMPLES.get(modul, [])))
    new = (old * count + q_vec) / (count + 1)
    new /= np.linalg.norm(new)  # renormalize
    _example_embeddings[modul] = new
    _example_counts[modul] = count + 1
