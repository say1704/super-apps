"""
Master Data Constants for Risk Assessment Module
ISMS 27001 Scoring Definitions - Single Source of Truth
"""

# ==================== FREKUENSI SCORING ====================
FREKUENSI_OPTIONS = [
    {"value": 1, "label": "0 sampai 1 insiden per tahun"},
    {"value": 2, "label": "2 insiden per tahun"},
    {"value": 3, "label": "Lebih dari atau sama dengan 3 insiden"},
    {"value": 4, "label": "Lebih dari atau sama dengan 5 insiden"},
    {"value": 5, "label": "Lebih dari atau sama dengan 10 insiden"},
]

# ==================== DAMPAK/IMPACT SCORING ====================
DAMPAK_OPTIONS = [
    {
        "value": 1,
        "label": "Tidak menyebabkan gangguan",
        "label_finansial": "Kerusakan finansial 0 - 1 juta",
    },
    {
        "value": 2,
        "label": "Aset gangguan... tugas pokok normal",
        "label_finansial": "Kerusakan finansial 1 - 25 juta",
    },
    {
        "value": 3,
        "label": "Sebagian aset pendukung... kegagalan",
        "label_finansial": "Kerusakan finansial 25 - 50 juta",
    },
    {
        "value": 4,
        "label": "Sebagian aset utama... kegagalan total",
        "label_finansial": "Kerusakan finansial 50 - 75 juta",
    },
    {
        "value": 5,
        "label": "Aset pemrosesan informasi utama... kegagalan total... bisnis tidak tercapai",
        "label_finansial": "Kerusakan finansial > 75 juta",
    },
]

# ==================== RISK LEVEL CLASSIFICATION ====================
RISK_LEVELS = [
    {"min": 1, "max": 4, "label": "Rendah", "color": "green", "bg": "bg-green-900/60", "text": "text-green-200", "border": "border-green-700"},
    {"min": 5, "max": 9, "label": "Sedang", "color": "yellow", "bg": "bg-yellow-900/60", "text": "text-yellow-200", "border": "border-yellow-700"},
    {"min": 10, "max": 25, "label": "Tinggi", "color": "red", "bg": "bg-red-900/60", "text": "text-red-200", "border": "border-red-700"},
]

def get_risk_level(score: int) -> dict:
    if score >= 10:
        return RISK_LEVELS[2]
    if score >= 5:
        return RISK_LEVELS[1]
    return RISK_LEVELS[0]

# ==================== OPPORTUNITY: MANFAAT (BENEFIT) SCORING ====================
MANFAAT_OPTIONS = [
    {
        "value": 3,
        "label": "Tinggi",
        "descriptions": [
            "Menghemat waktu > 50%",
            "Keuntungan > 50.000.000",
            "Trend Internasional",
        ],
    },
    {
        "value": 2,
        "label": "Sedang",
        "descriptions": [
            "Menghemat waktu 20-50%",
            "Keuntungan 10-50 juta",
            "Trend Nasional",
        ],
    },
    {
        "value": 1,
        "label": "Rendah",
        "descriptions": [
            "Menghemat waktu < 20%",
            "Keuntungan < 10.000.000",
            "Trend Lokal",
        ],
    },
]

# ==================== OPPORTUNITY: SUMBER DAYA (RESOURCES) SCORING ====================
SUMBER_DAYA_OPTIONS = [
    {
        "value": 1,
        "label": "Rendah",
        "description": "< 20% tambahan",
    },
    {
        "value": 2,
        "label": "Sedang",
        "description": "20% - 40% tambahan",
    },
    {
        "value": 3,
        "label": "Tinggi",
        "description": "> 40% tambahan",
    },
]

# ==================== OPPORTUNITY MATRIX (Grade I-IV) ====================
# Matrix: [Sumber Daya row] x [Manfaat column] -> Grade
# Row index = sumber_daya_value - 1, Col index = manfaat_value - 1
OPPORTUNITY_MATRIX = [
    # Manfaat: 1(Rendah)  2(Sedang)    3(Tinggi)
    ["Grade III", "Grade II",  "Grade I"],  # Sumber Daya 1 (Rendah)
    ["Grade IV", "Grade III", "Grade II"],  # Sumber Daya 2 (Sedang)
    ["Grade IV", "Grade IV",  "Grade III"], # Sumber Daya 3 (Tinggi)
]

OPPORTUNITY_GRADES = {
    "Grade I": {"label": "Sangat Menguntungkan", "bg": "bg-green-900/60", "text": "text-green-200", "border": "border-green-700"},
    "Grade II": {"label": "Keuntungan Besar", "bg": "bg-yellow-900/60", "text": "text-yellow-200", "border": "border-yellow-700"},
    "Grade III": {"label": "Biasa", "bg": "bg-orange-900/60", "text": "text-orange-200", "border": "border-orange-700"},
    "Grade IV": {"label": "Tidak Menguntungkan", "bg": "bg-red-900/60", "text": "text-red-200", "border": "border-red-700"},
}

def calculate_opportunity_grade(sumber_daya_value: int, manfaat_value: int) -> str:
    row = min(sumber_daya_value, 3) - 1
    col = min(manfaat_value, 3) - 1
    return OPPORTUNITY_MATRIX[row][col]

def get_opportunity_grade_info(grade: str) -> dict:
    return OPPORTUNITY_GRADES.get(grade, OPPORTUNITY_GRADES["Grade III"])

# ==================== STATUS PELAKSANAAN ====================
STATUS_PELAKSANAAN_OPTIONS = [
    "Belum Dimulai",
    "In Progress",
    "Selesai",
    "Ditunda",
]

# ==================== KATEGORI ISU ====================
KATEGORI_ISU_OPTIONS = [
    "Internal",
    "Eksternal",
]
