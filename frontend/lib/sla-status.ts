const FULL_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function monthFull(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10);
  return `${FULL_MONTHS[m - 1] ?? ym} ${ym.slice(0, 4)}`;
}

export function isRunningMonth(ym: string): boolean {
  return ym === new Date().toISOString().slice(0, 7);
}

export function slaVerdict(status: string): string {
  switch (status) {
    case 'OK': return 'Aman — monitoring lengkap, tidak ada downtime';
    case 'WARNING': return 'Perhatian — data monitoring kurang lengkap';
    case 'KRITIS': return 'Perlu tindak lanjut — data monitoring tidak lengkap';
    default: return '-';
  }
}

export const SLA_NOTE = 'SLA = kelengkapan data monitoring, bukan ukuran downtime server. Penilaian dimulai sejak monitoring efektif 10-08-2026; status Aman berarti tidak ada downtime terindikasi.';