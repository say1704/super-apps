// PATCH: TypeScript interfaces matching backend response exactly

export interface PenilaianRisiko {
  id: number;
  nama_isu: string | null;
  proses_bisnis: string | null;
  nama_asset: string | null;
  kerentanan: string | null;
  ancaman: string | null;
  risiko: string | null;
  akibat_dampak: string | null;
  frekuensi_sebelum: number | null;
  frekuensi_sebelum_desc: string | null;
  dampak_sebelum: number | null;
  dampak_sebelum_desc: string | null;
  dampak_sebelum_finansial: string | null;
  nilai_risiko_dasar: number | null;
  pengendalian_yang_ada: string | null;
  pemilihan_kontrol: string | null;
  frekuensi_sesudah: number | null;
  frekuensi_sesudah_desc: string | null;
  dampak_sesudah: number | null;
  dampak_sesudah_desc: string | null;
  dampak_sesudah_finansial: string | null;
  nilai_risiko_sisa: number | null;
  pengendalian_tambahan: string | null;
  kebutuhan_sumber_daya: string | null;
  penanggung_jawab: string | null;
  target_waktu: string | null;
  frekuensi_target: number | null;
  frekuensi_target_desc: string | null;
  dampak_target: number | null;
  dampak_target_desc: string | null;
  dampak_target_finansial: string | null;
  nilai_risiko_target: number | null;
  tanggal_peninjauan: string | null;
  status_pelaksanaan: string | null;
  created_at: string | null;
  deleted_at?: string | null; // PATCH: Soft delete support
}

export interface InterestedParty {
  id: number;
  interested_party: string | null;
  needs: string | null;
  expectations: string | null;
  risk: string | null;
  opportunity: string | null;
  created_at: string | null;
  deleted_at?: string | null;
}

export interface Peluang {
  id: number;
  opportunities: string | null;
  manfaat_diharapkan: string | null;
  manfaat_diharapkan_value: number | null;
  manfaat_diharapkan_desc: string | null;
  manfaat_saat_ini: string | null;
  manfaat_saat_ini_value: number | null;
  manfaat_saat_ini_desc: string | null;
  kebutuhan_sumber_daya: string | null;
  sumber_daya_value: number | null;
  sumber_daya_desc: string | null;
  opportunity_grade: string | null; // PATCH: Match backend field name (was grade_peluang)
  opportunity_grade_label: string | null;
  action_plan_what: string | null;
  action_plan_resources: string | null;
  action_plan_who: string | null;
  action_plan_when: string | null;
  action_plan_how: string | null;
  keterangan: string | null;
  created_at: string | null;
  deleted_at?: string | null;
}

export interface IsuMatrix {
  id: number;
  kategori: string | null;
  issues: string | null;
  risks: string | null;
  opportunities: string | null;
  created_at: string | null;
  deleted_at?: string | null;
}

export interface PaginationResponse {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiResponse<T> {
  data: T[];
  pagination: PaginationResponse;
}

export interface RiskStats {
  critical_risk: number;
  overdue_treatment: number;
  in_progress: number;
  total: number;
}
