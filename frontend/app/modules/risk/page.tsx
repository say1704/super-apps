"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/auth';
import { useToast } from '@/components/toast';

const STATUS_OPTIONS = ['Belum Dimulai', 'In Progress', 'Selesai', 'Ditunda'];
const KATEGORI_OPTIONS = ['Internal', 'Eksternal'];
const QUARTER_OPTIONS = ['Q.1', 'Q.2', 'Q.3', 'Q.4'];

// ==================== MASTER DATA CONSTANTS ====================
const FREKUENSI_OPTIONS = [
  { value: 1, label: '0 sampai 1 insiden per tahun' },
  { value: 2, label: '2 insiden per tahun' },
  { value: 3, label: 'Lebih dari atau sama dengan 3 insiden' },
  { value: 4, label: 'Lebih dari atau sama dengan 5 insiden' },
  { value: 5, label: 'Lebih dari atau sama dengan 10 insiden' },
];

const DAMPAK_OPTIONS = [
  { value: 1, label: 'Tidak menyebabkan gangguan', label_finansial: 'Kerusakan finansial 0 - 1 juta' },
  { value: 2, label: 'Aset gangguan... tugas pokok normal', label_finansial: 'Kerusakan finansial 1 - 25 juta' },
  { value: 3, label: 'Sebagian aset pendukung... kegagalan', label_finansial: 'Kerusakan finansial 25 - 50 juta' },
  { value: 4, label: 'Sebagian aset utama... kegagalan total', label_finansial: 'Kerusakan finansial 50 - 75 juta' },
  { value: 5, label: 'Aset pemrosesan informasi utama... kegagalan total... bisnis tidak tercapai', label_finansial: 'Kerusakan finansial > 75 juta' },
];

const MANFAAT_OPTIONS = [
  { value: 3, label: 'Tinggi', descriptions: ['Menghemat waktu > 50%', 'Keuntungan > 50.000.000', 'Trend Internasional'] },
  { value: 2, label: 'Sedang', descriptions: ['Menghemat waktu 20-50%', 'Keuntungan 10-50 juta', 'Trend Nasional'] },
  { value: 1, label: 'Rendah', descriptions: ['Menghemat waktu < 20%', 'Keuntungan < 10.000.000', 'Trend Lokal'] },
];

const SUMBER_DAYA_OPTIONS = [
  { value: 1, label: 'Rendah', description: '< 20% tambahan' },
  { value: 2, label: 'Sedang', description: '20% - 40% tambahan' },
  { value: 3, label: 'Tinggi', description: '> 40% tambahan' },
];

const OPPORTUNITY_MATRIX = [
  ['Grade III', 'Grade II', 'Grade I'],
  ['Grade IV', 'Grade III', 'Grade II'],
  ['Grade IV', 'Grade IV', 'Grade III'],
];

const OPPORTUNITY_GRADES: Record<string, { label: string; bg: string; text: string }> = {
  'Grade I': { label: 'Sangat Menguntungkan', bg: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200', text: 'text-green-800 dark:text-green-200' },
  'Grade II': { label: 'Keuntungan Besar', bg: 'bg-yellow-100 dark:bg-yellow-900/60 text-yellow-800 dark:text-yellow-200', text: 'text-yellow-800 dark:text-yellow-200' },
  'Grade III': { label: 'Biasa', bg: 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200', text: 'text-orange-800 dark:text-orange-200' },
  'Grade IV': { label: 'Tidak Menguntungkan', bg: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200', text: 'text-red-800 dark:text-red-200' },
};

const getRiskLevel = (score: number) => {
  if (score >= 10) return { label: 'Tinggi', bg: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200', text: 'text-red-800 dark:text-red-200', border: 'border-red-300 dark:border-red-700' };
  if (score >= 5) return { label: 'Sedang', bg: 'bg-yellow-100 dark:bg-yellow-900/60 text-yellow-800 dark:text-yellow-200', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-700' };
  return { label: 'Rendah', bg: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200', text: 'text-green-800 dark:text-green-200', border: 'border-green-300 dark:border-green-700' };
};

const getDeadlineStatus = (targetWaktu: string | null, status: string) => {
  if (!targetWaktu || status === 'Selesai') return { label: 'OK', bg: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300', text: 'text-green-800 dark:text-green-300', icon: '' };
  if (targetWaktu.startsWith('Q.')) return { label: targetWaktu, bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300', text: 'text-blue-800 dark:text-blue-300', icon: '' };
  const target = new Date(targetWaktu);
  if (isNaN(target.getTime())) return { label: 'OK', bg: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300', text: 'text-green-800 dark:text-green-300', icon: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'Overdue', bg: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200', text: 'text-red-800 dark:text-red-200', icon: '🔴' };
  if (diff <= 7) return { label: 'Segera', bg: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200', text: 'text-yellow-800 dark:text-yellow-200', icon: '⚠️' };
  return { label: 'OK', bg: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300', text: 'text-green-800 dark:text-green-300', icon: '' };
};

const calculateOpportunityGrade = (sumberDayaValue: number, manfaatValue: number) => {
  const row = Math.min(sumberDayaValue, 3) - 1;
  const col = Math.min(manfaatValue, 3) - 1;
  if (row < 0 || col < 0) return null;
  return OPPORTUNITY_MATRIX[row][col];
};

type TabType = 'isu' | 'penilaian' | 'interested' | 'peluang';

export default function RiskAssessmentModule() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('isu');
  const [loading, setLoading] = useState(true);
  const [expertMode, setExpertMode] = useState(false);

  const [penilaianData, setPenilaianData] = useState<any[]>([]);
  const [interestedData, setInterestedData] = useState<any[]>([]);
  const [peluangData, setPeluangData] = useState<any[]>([]);
  const [isuData, setIsuData] = useState<any[]>([]);
  const [penilaianStats, setPenilaianStats] = useState({ critical_risk: 0, overdue_treatment: 0, in_progress: 0, total: 0, high_risk: 0, medium_risk: 0, low_risk: 0, selesai: 0, belum_dimulai: 0, ditunda: 0 });
  const [interestedStats, setInterestedStats] = useState({ total: 0, high: 0, medium: 0, low: 0 });
  const [peluangStats, setPeluangStats] = useState({ total: 0, grade_i: 0, grade_ii: 0, grade_iii: 0, grade_iv: 0, no_grade: 0 });
  const [isuStats, setIsuStats] = useState({ total: 0, internal: 0, eksternal: 0, no_kategori: 0 });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total_records: 0, total_pages: 0, has_next: false, has_prev: false });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState('');
  const [riskLevelFilter, setRiskLevelFilter] = useState('');
  const [overdueFilter, setOverdueFilter] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showInfo, setShowInfo] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      if (searchQuery) params.append('search', searchQuery);
      if (activeTab === 'penilaian') {
        if (statusFilter) params.append('status_filter', statusFilter);
        if (riskLevelFilter) params.append('risk_level_filter', riskLevelFilter);
        if (overdueFilter) params.append('overdue_filter', 'true');
      }
      if (activeTab === 'isu' && kategoriFilter) params.append('kategori_filter', kategoriFilter);

      const endpoints: Record<TabType, string> = {
        penilaian: `/api/penilaian-risiko?${params}`,
        interested: `/api/interested-parties?${params}`,
        peluang: `/api/peluang?${params}`,
        isu: `/api/isu-matrix?${params}`,
      };

      const result = await apiRequest(endpoints[activeTab]);
      const dataMap: Record<TabType, (d: any[]) => void> = {
        penilaian: setPenilaianData, interested: setInterestedData,
        peluang: setPeluangData, isu: setIsuData,
      };
      dataMap[activeTab](result.data || []);
      setPagination(result.pagination || { page: 1, page_size: pageSize, total_records: 0, total_pages: 0, has_next: false, has_prev: false });

      const statsEndpoints: Record<TabType, string> = {
        penilaian: '/api/penilaian-risiko/stats',
        interested: '/api/interested-parties/stats',
        peluang: '/api/peluang/stats',
        isu: '/api/isu-matrix/stats',
      };
      const statsSetters: Record<TabType, (d: any) => void> = {
        penilaian: setPenilaianStats, interested: setInterestedStats,
        peluang: setPeluangStats, isu: setIsuStats,
      };
      try {
        const statsResult = await apiRequest(statsEndpoints[activeTab]);
        statsSetters[activeTab](statsResult);
      } catch { /* stats fetch failed */ }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize, sortBy, sortOrder, searchQuery, statusFilter, kategoriFilter, riskLevelFilter, overdueFilter, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const result = await apiRequest('/api/isu-matrix?page=1&page_size=100&sort_by=created_at&sort_order=desc');
        setIsuData(result.data || []);
      } catch { /* failed */ }
    })();
  }, []);

  const handleSort = (column: string) => {
    setSortBy(column);
    setSortOrder(sortBy === column && sortOrder === 'desc' ? 'asc' : 'desc');
    setPage(1);
  };

  const openAddModal = () => {
    setEditingItem(null);
    const defaults: Record<TabType, any> = {
      penilaian: {
        nama_isu: '', proses_bisnis: '', nama_asset: '', kerentanan: '', ancaman: '',
        risiko: '', akibat_dampak: '', frekuensi_sebelum: 1, frekuensi_sebelum_desc: '',
        dampak_sebelum: 1, dampak_sebelum_desc: '', dampak_sebelum_finansial: '',
        pengendalian_yang_ada: '', pemilihan_kontrol: '', frekuensi_sesudah: 1, frekuensi_sesudah_desc: '',
        dampak_sesudah: 1, dampak_sesudah_desc: '', dampak_sesudah_finansial: '',
        pengendalian_tambahan: '', kebutuhan_sumber_daya: '', penanggung_jawab: '',
        target_waktu: '', target_waktu_type: 'date', target_quarter: '', target_year: '',
        frekuensi_target: 1, frekuensi_target_desc: '',
        dampak_target: 1, dampak_target_desc: '', dampak_target_finansial: '',
        tanggal_peninjauan: '', status_pelaksanaan: 'Belum Dimulai',
        isu_matrix_id: '',
      },
      interested: { interested_party: '', needs: '', expectations: '', risk: 'Low', opportunity: 'Low' },
      peluang: {
        opportunities: '', manfaat_diharapkan: '', manfaat_diharapkan_value: 1, manfaat_diharapkan_desc: '',
        manfaat_saat_ini: '', manfaat_saat_ini_value: 1, manfaat_saat_ini_desc: '',
        kebutuhan_sumber_daya: '', sumber_daya_value: 1, sumber_daya_desc: '',
        opportunity_grade: '', opportunity_grade_label: '',
        action_plan_what: '', action_plan_resources: '', action_plan_who: '',
        action_plan_when: '', action_plan_how: '', keterangan: '',
      },
      isu: { kategori: 'Internal', issues: '', risks: '', opportunities: '' },
    };
    setFormData(defaults[activeTab]);
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    const parsed = { ...item };
    if (item.target_waktu && item.target_waktu.startsWith('Q.')) {
      const parts = item.target_waktu.split(' ');
      parsed.target_waktu_type = 'quarter';
      parsed.target_quarter = parts[0] || '';
      parsed.target_year = parts[1] || '';
      parsed.target_waktu = item.target_waktu;
    } else {
      parsed.target_waktu_type = 'date';
    }
    setFormData(parsed);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (activeTab === 'penilaian' && !formData.nama_isu) { toast.error('Nama Isu is required'); return; }


    const endpoints: Record<TabType, string> = {
      penilaian: editingItem ? `/api/penilaian-risiko/${editingItem.id}` : '/api/penilaian-risiko',
      interested: editingItem ? `/api/interested-parties/${editingItem.id}` : '/api/interested-parties',
      peluang: editingItem ? `/api/peluang/${editingItem.id}` : '/api/peluang',
      isu: editingItem ? `/api/isu-matrix/${editingItem.id}` : '/api/isu-matrix',
    };
    const method = editingItem ? 'PUT' : 'POST';

    try {
      const form = new FormData();
      const submitData = { ...formData };
      if (activeTab === 'penilaian') {
        if (submitData.target_waktu_type === 'quarter' && submitData.target_quarter && submitData.target_year) {
          submitData.target_waktu = `${submitData.target_quarter} ${submitData.target_year}`;
        }
        delete submitData.target_waktu_type;
        delete submitData.target_quarter;
        delete submitData.target_year;
      }
      Object.entries(submitData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') form.append(key, String(value));
      });
      await apiRequest(endpoints[activeTab], { method, body: form });
      toast.success(editingItem ? 'Data updated' : 'Data created');
      setShowModal(false);
      fetchData();
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this item?')) return;
    
    const endpoints: Record<TabType, string> = {
      penilaian: `/api/penilaian-risiko/${id}`, interested: `/api/interested-parties/${id}`,
      peluang: `/api/peluang/${id}`, isu: `/api/isu-matrix/${id}`,
    };
    try {
      await apiRequest(endpoints[activeTab], { method: 'DELETE' });
      toast.success('Deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.append('page', '1'); params.append('page_size', '100');
      const endpoints: Record<TabType, string> = {
        penilaian: `/api/penilaian-risiko?${params}`, interested: `/api/interested-parties?${params}`,
        peluang: `/api/peluang?${params}`, isu: `/api/isu-matrix?${params}`,
      };
      const result = await apiRequest(endpoints[activeTab]);
      const data = result.data || [];

      const sheetNames: Record<TabType, string> = {
        penilaian: 'Penilaian Risiko', interested: 'Interested Parties',
        peluang: 'Peluang', isu: 'Isu Matrix',
      };

      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetNames[activeTab]);
      const keys = data.length > 0 ? Object.keys(data[0]) : [];
      const rows = data.map((row: Record<string, any>) => keys.map(k => row[k]));
      ws.addRow(keys);
      ws.addRows(rows);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RiskAssessment_${sheetNames[activeTab]}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const data = evt.target?.result as ArrayBuffer;
        const { default: ExcelJS } = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(data as any);
        const ws = wb.worksheets[0];
        const headerCells = ws.getRow(1);
        const jsonData: any[] = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const entry: Record<string, any> = {};
          headerCells.eachCell((headerCell, colNumber) => {
            const key = String(headerCell.value ?? '');
            entry[key] = row.getCell(colNumber).value ?? '';
          });
          jsonData.push(entry);
        });
        
        const endpoints: Record<TabType, string> = {
          penilaian: '/api/penilaian-risiko', interested: '/api/interested-parties',
          peluang: '/api/peluang', isu: '/api/isu-matrix',
        };
        let count = 0;
        for (const row of jsonData) {
          const form = new FormData();
          Object.entries(row).forEach(([k, v]) => { if (v !== null && v !== undefined) form.append(k, String(v)); });
          try {
            await apiRequest(endpoints[activeTab], { method: 'POST', body: form });
            count++;
          } catch { /* skip */ }
        }
        toast.success(`Imported ${count}/${jsonData.length}`);
        fetchData();
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error('Import failed');
    }
    e.target.value = '';
  };

  const dashboardCards = useMemo(() => {
    if (activeTab === 'penilaian') {
      return [
        { icon: '🔴', label: 'Critical Risk', value: penilaianStats.critical_risk, color: 'bg-red-600' },
        { icon: '🟠', label: 'High Risk', value: penilaianStats.high_risk, color: 'bg-orange-600' },
        { icon: '🟡', label: 'Medium Risk', value: penilaianStats.medium_risk, color: 'bg-yellow-600' },
        { icon: '🟢', label: 'Low Risk', value: penilaianStats.low_risk, color: 'bg-green-600' },
        { icon: '⚠️', label: 'Overdue', value: penilaianStats.overdue_treatment, color: 'bg-red-800' },
        { icon: '🔄', label: 'In Progress', value: penilaianStats.in_progress, color: 'bg-blue-600' },
        { icon: '✅', label: 'Selesai', value: penilaianStats.selesai, color: 'bg-emerald-600' },
        { icon: '⏳', label: 'Belum Dimulai', value: penilaianStats.belum_dimulai, color: 'bg-gray-600' },
      ];
    }
    if (activeTab === 'interested') {
      return [
        { icon: '🔴', label: 'High Risk', value: interestedStats.high, color: 'bg-red-600' },
        { icon: '🟡', label: 'Medium Risk', value: interestedStats.medium, color: 'bg-yellow-600' },
        { icon: '🟢', label: 'Low Risk', value: interestedStats.low, color: 'bg-green-600' },
        { icon: '👥', label: 'Total', value: interestedStats.total, color: 'bg-blue-600' },
      ];
    }
    if (activeTab === 'peluang') {
      return [
        { icon: '🟢', label: 'Grade I', value: peluangStats.grade_i, color: 'bg-green-600' },
        { icon: '🟡', label: 'Grade II', value: peluangStats.grade_ii, color: 'bg-yellow-600' },
        { icon: '🟠', label: 'Grade III', value: peluangStats.grade_iii, color: 'bg-orange-600' },
        { icon: '🔴', label: 'Grade IV', value: peluangStats.grade_iv, color: 'bg-red-600' },
        { icon: '💡', label: 'Total', value: peluangStats.total, color: 'bg-blue-600' },
      ];
    }
    return [
      { icon: '🔵', label: 'Internal', value: isuStats.internal, color: 'bg-blue-600' },
      { icon: '🟠', label: 'Eksternal', value: isuStats.eksternal, color: 'bg-orange-600' },
      { icon: '📋', label: 'Total', value: isuStats.total, color: 'bg-gray-600' },
    ];
  }, [activeTab, penilaianStats, interestedStats, peluangStats, isuStats]);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'isu', label: 'Isu', icon: '📋' },
    { key: 'penilaian', label: 'Penilaian Risiko', icon: '📊' },
    { key: 'interested', label: 'Interested Parties', icon: '👥' },
    { key: 'peluang', label: 'Peluang', icon: '💡' },
  ];

  const renderSortIcon = (col: string) => sortBy === col ? (sortOrder === 'desc' ? ' 🔽' : ' 🔼') : '';
  const ThSortable = ({ column, children }: { column: string; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:bg-gray-700 select-none whitespace-nowrap" onClick={() => handleSort(column)}>
      {children}{renderSortIcon(column)}
    </th>
  );

  // ==================== SMART SCORING HELPERS ====================
  const updateFrekuensi = (field: string, value: number, desc: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, [field]: value, [`${field}_desc`]: desc };
      if (field === 'frekuensi_sebelum') updated.nilai_risiko_dasar = value * (prev.dampak_sebelum || 1);
      if (field === 'frekuensi_sesudah') updated.nilai_risiko_sisa = value * (prev.dampak_sesudah || 1);
      if (field === 'frekuensi_target') updated.nilai_risiko_target = value * (prev.dampak_target || 1);
      return updated;
    });
  };

  const updateDampak = (field: string, value: number, desc: string, finansial: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, [field]: value, [`${field}_desc`]: desc, [`${field}_finansial`]: finansial };
      if (field === 'dampak_sebelum') updated.nilai_risiko_dasar = (prev.frekuensi_sebelum || 1) * value;
      if (field === 'dampak_sesudah') updated.nilai_risiko_sisa = (prev.frekuensi_sesudah || 1) * value;
      if (field === 'dampak_target') updated.nilai_risiko_target = (prev.frekuensi_target || 1) * value;
      return updated;
    });
  };

  const updateManfaat = (field: string, value: number, desc: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, [field]: value, [`${field}_desc`]: desc };
      const sdVal = field.includes('diharapkan') ? prev.sumber_daya_value || 1 : prev.sumber_daya_value || 1;
      const mVal = field.includes('diharapkan') ? value : prev.manfaat_diharapkan_value || 1;
      const grade = calculateOpportunityGrade(sdVal, mVal);
      if (grade) {
        updated.opportunity_grade = grade;
        updated.opportunity_grade_label = OPPORTUNITY_GRADES[grade]?.label || '';
      }
      return updated;
    });
  };

  const updateSumberDaya = (value: number, desc: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, sumber_daya_value: value, sumber_daya_desc: desc };
      const mVal = prev.manfaat_diharapkan_value || 1;
      const grade = calculateOpportunityGrade(value, mVal);
      if (grade) {
        updated.opportunity_grade = grade;
        updated.opportunity_grade_label = OPPORTUNITY_GRADES[grade]?.label || '';
      }
      return updated;
    });
  };

  const ThSection = ({ children, bg, colSpan }: { children: React.ReactNode; bg: string; colSpan: number }) => (
    <th colSpan={colSpan} className={`${bg} px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700`}>
      {children}
    </th>
  );

  const ThCol = ({ children, sortable, column }: { children: React.ReactNode; sortable?: boolean; column?: string }) => (
    <th
      className={`px-2 py-1.5 text-left text-[10px] font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap ${sortable && column ? 'cursor-pointer hover:bg-gray-100 dark:bg-gray-700 select-none' : ''}`}
      onClick={() => sortable && column ? handleSort(column) : undefined}
    >
      {children}{sortable && column ? renderSortIcon(column) : ''}
    </th>
  );

  const TdText = ({ value, maxWidth = 'w-[140px]', title }: { value: string; maxWidth?: string; title?: string }) => (
    <td className={`px-2 py-1.5 ${maxWidth} truncate text-gray-700 dark:text-gray-300`} title={title || value || ''}>{value || '-'}</td>
  );

  const TdCenter = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-2 py-1.5 text-center text-gray-700 dark:text-gray-300 whitespace-nowrap ${className}`}>{children}</td>
  );

  // ==================== TAB 1: Penilaian Risiko ====================
  const renderPenilaianRisiko = () => (
    <div className="overflow-x-auto rounded">
      <table className="min-w-[2800px] text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900">
            <ThSection bg="bg-white dark:bg-gray-800" colSpan={1}>#</ThSection>
            <ThSection bg="bg-blue-900/30" colSpan={7}>Identitas</ThSection>
            <ThSection bg="bg-teal-900/30" colSpan={3}>Sebelum</ThSection>
            <ThSection bg="bg-orange-900/30" colSpan={2}>Pengendalian</ThSection>
            <ThSection bg="bg-yellow-900/30" colSpan={3}>Sesudah</ThSection>
            <ThSection bg="bg-red-900/30" colSpan={3}>Rencana</ThSection>
            <ThSection bg="bg-green-900/30" colSpan={3}>Target</ThSection>
            <ThSection bg="bg-purple-900/30" colSpan={2}>Peninjauan</ThSection>
            <ThSection bg="bg-white dark:bg-gray-800" colSpan={1}>Actions</ThSection>
          </tr>
          <tr className="bg-white dark:bg-gray-800/80">
            <ThCol>#</ThCol>
            <ThCol sortable column="nama_isu">Nama Isu</ThCol>
            <ThCol>Proses Bisnis</ThCol>
            <ThCol>Asset</ThCol>
            <ThCol>Kerentanan</ThCol>
            <ThCol>Ancaman</ThCol>
            <ThCol>Risiko</ThCol>
            <ThCol>Akibat/Dampak</ThCol>
            <ThCol>Frek</ThCol>
            <ThCol>Dampak</ThCol>
            <ThCol sortable column="nilai_risiko_dasar">NRD</ThCol>
            <ThCol>Pengendalian</ThCol>
            <ThCol>Kontrol</ThCol>
            <ThCol>Frek Ses</ThCol>
            <ThCol>Dampak Ses</ThCol>
            <ThCol sortable column="nilai_risiko_sisa">NRS</ThCol>
            <ThCol>Peng. Tambahan</ThCol>
            <ThCol>PJ</ThCol>
            <ThCol>Target Waktu</ThCol>
            <ThCol>Frek Tgt</ThCol>
            <ThCol>Dampak Tgt</ThCol>
            <ThCol sortable column="nilai_risiko_target">NT</ThCol>
            <ThCol>Tgl Peninjauan</ThCol>
            <ThCol sortable column="status_pelaksanaan">Status</ThCol>
            <ThCol>Actions</ThCol>
          </tr>
        </thead>
        <tbody>
          {penilaianData.map((item, idx) => {
            const riskLevel = getRiskLevel(item.nilai_risiko_dasar || 0);
            const sisaLevel = getRiskLevel(item.nilai_risiko_sisa || 0);
            const targetLevel = getRiskLevel(item.nilai_risiko_target || 0);
            const deadline = getDeadlineStatus(item.target_waktu, item.status_pelaksanaan);
            const isOverdue = deadline.label === 'Overdue';
            return (
              <tr key={item.id} className={`border-b border-gray-200 dark:border-gray-700/50 hover:bg-white dark:bg-gray-800/60 ${isOverdue ? 'bg-red-900/10' : ''}`}>
                <td className="px-2 py-1.5 text-gray-400 dark:text-gray-500 text-center w-[30px]">{(page - 1) * pageSize + idx + 1}</td>
                <td className="px-2 py-1.5 w-[160px] truncate text-gray-900 dark:text-white font-medium" title={item.nama_isu}>{item.nama_isu || '-'}</td>
                <TdText value={item.proses_bisnis} maxWidth="w-[120px]" />
                <TdText value={item.nama_asset} maxWidth="w-[100px]" />
                <TdText value={item.kerentanan} maxWidth="w-[140px]" />
                <TdText value={item.ancaman} maxWidth="w-[140px]" />
                <TdText value={item.risiko} maxWidth="w-[160px]" />
                <TdText value={item.akibat_dampak} maxWidth="w-[160px]" />
                <TdCenter>{item.frekuensi_sebelum || '-'}</TdCenter>
                <TdCenter>{item.dampak_sebelum || '-'}</TdCenter>
                <TdCenter>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${riskLevel.bg} ${riskLevel.text} border ${riskLevel.border}`}>
                    {item.nilai_risiko_dasar || 0}
                  </span>
                </TdCenter>
                <TdText value={item.pengendalian_yang_ada} maxWidth="w-[140px]" />
                <TdText value={item.pemilihan_kontrol} maxWidth="w-[120px]" />
                <TdCenter>{item.frekuensi_sesudah || '-'}</TdCenter>
                <TdCenter>{item.dampak_sesudah || '-'}</TdCenter>
                <TdCenter>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sisaLevel.bg} ${sisaLevel.text}`}>
                    {item.nilai_risiko_sisa || 0}
                  </span>
                </TdCenter>
                <TdText value={item.pengendalian_tambahan} maxWidth="w-[140px]" />
                <TdText value={item.penanggung_jawab} maxWidth="w-[100px]" />
                <TdCenter className={isOverdue ? 'text-red-400 font-medium' : ''}>{item.target_waktu || '-'}</TdCenter>
                <TdCenter>{item.frekuensi_target || '-'}</TdCenter>
                <TdCenter>{item.dampak_target || '-'}</TdCenter>
                <TdCenter>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${targetLevel.bg} ${targetLevel.text}`}>
                    {item.nilai_risiko_target || 0}
                  </span>
                </TdCenter>
                <TdCenter>{item.tanggal_peninjauan || '-'}</TdCenter>
                <TdCenter>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    item.status_pelaksanaan === 'Selesai' ? 'bg-green-900/60 text-green-200' :
                    item.status_pelaksanaan === 'In Progress' ? 'bg-blue-900/60 text-blue-200' :
                    item.status_pelaksanaan === 'Ditunda' ? 'bg-yellow-900/60 text-yellow-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {item.status_pelaksanaan || '-'}
                  </span>
                </TdCenter>
                <TdCenter>
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => openEditModal(item)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/30">✏️</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded bg-red-900/30">🗑️</button>
                  </div>
                </TdCenter>
              </tr>
            );
          })}
        </tbody>
      </table>
      {penilaianData.length === 0 && <div className="p-8 text-center text-gray-400 dark:text-gray-500">No data. Click "+ Add Data".</div>}
    </div>
  );

  // ==================== TAB 2: Interested Parties ====================
  const renderInterestedParties = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">#</th>
            <ThSortable column="interested_party">Interested Parties</ThSortable>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Needs</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Expectations</th>
            <ThSortable column="risk">Risk</ThSortable>
            <ThSortable column="opportunity">Opportunity</ThSortable>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {interestedData.map((item, idx) => {
            const riskColor = item.risk === 'High' ? 'bg-red-900/60 text-red-200' : item.risk === 'Medium' ? 'bg-yellow-900/60 text-yellow-200' : 'bg-green-900/60 text-green-200';
            const oppColor = item.opportunity === 'High' ? 'bg-green-900/60 text-green-200' : item.opportunity === 'Medium' ? 'bg-blue-900/60 text-blue-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
            return (
              <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-white dark:bg-gray-800">
                <td className="px-3 py-2 text-gray-400 dark:text-gray-500 dark:text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[200px] truncate">{item.interested_party || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{item.needs || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{item.expectations || '-'}</td>
                <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs ${riskColor}`}>{item.risk || '-'}</span></td>
                <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs ${oppColor}`}>{item.opportunity || '-'}</span></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(item)} className="text-blue-400 text-xs px-2 py-1 rounded bg-blue-900/30">✏️</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 text-xs px-2 py-1 rounded bg-red-900/30">🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {interestedData.length === 0 && <div className="p-8 text-center text-gray-400 dark:text-gray-500">No data.</div>}
    </div>
  );

  // ==================== TAB 3: Peluang ====================
  const renderPeluang = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-green-900/30 border-b border-green-800">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">#</th>
            <ThSortable column="opportunities">Opportunities</ThSortable>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Manfaat Diharpkan</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Manfaat Saat Ini</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Sumber Daya</th>
            <ThSortable column="opportunity_grade">Grade</ThSortable>
          </tr>
          <tr className="bg-blue-900/20 border-b border-blue-800">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">What</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Resources</th>
            <ThSortable column="action_plan_who">Who</ThSortable>
            <ThSortable column="action_plan_when">When</ThSortable>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">How Evaluated</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Keterangan</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {peluangData.map((item, idx) => {
            const gradeInfo = item.opportunity_grade ? OPPORTUNITY_GRADES[item.opportunity_grade] : null;
            return (
              <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-white dark:bg-gray-800">
                <td className="px-3 py-2 text-gray-400 dark:text-gray-500 dark:text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[120px] truncate">{item.opportunities || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{item.manfaat_diharapkan || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{item.manfaat_saat_ini || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{item.kebutuhan_sumber_daya || '-'}</td>
                <td className="px-3 py-2 text-center">
                  {gradeInfo ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeInfo.bg} ${gradeInfo.text}`}>
                      {item.opportunity_grade}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{item.action_plan_what || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[80px] truncate">{item.action_plan_resources || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{item.action_plan_who || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.action_plan_when || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{item.action_plan_how || '-'}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[80px] truncate">{item.keterangan || '-'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(item)} className="text-blue-400 text-xs px-2 py-1 rounded bg-blue-900/30">✏️</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 text-xs px-2 py-1 rounded bg-red-900/30">🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {peluangData.length === 0 && <div className="p-8 text-center text-gray-400 dark:text-gray-500">No data.</div>}
    </div>
  );

  // ==================== TAB 4: Isu Matrix ====================
  const renderIsuMatrix = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">#</th>
            <ThSortable column="kategori">Kategori</ThSortable>
            <ThSortable column="issues">Issues</ThSortable>
            <ThSortable column="risks">Risks</ThSortable>
            <ThSortable column="opportunities">Opportunities</ThSortable>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isuData.map((item, idx) => (
            <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-white dark:bg-gray-800">
              <td className="px-3 py-2 text-gray-400 dark:text-gray-500 dark:text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded text-xs ${item.kategori === 'Internal' ? 'bg-blue-900/60 text-blue-200' : 'bg-orange-900/60 text-orange-200'}`}>
                  {item.kategori === 'Internal' ? '🔵' : '🟠'} {item.kategori || '-'}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[250px] truncate">{item.issues || '-'}</td>
              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[250px] truncate">{item.risks || '-'}</td>
              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[250px] truncate">{item.opportunities || '-'}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button onClick={() => openEditModal(item)} className="text-blue-400 text-xs px-2 py-1 rounded bg-blue-900/30">✏️</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-400 text-xs px-2 py-1 rounded bg-red-900/30">🗑️</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isuData.length === 0 && <div className="p-8 text-center text-gray-400 dark:text-gray-500">No data.</div>}
    </div>
  );

  // ==================== MODAL FORM ====================
  const renderModal = () => {
    if (!showModal) return null;
    const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const labelClass = "block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300";
    const selectClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm";

    const InfoPopup = ({ type }: { type: string }) => (
      <button onClick={() => setShowInfo(showInfo === type ? null : type)} className="ml-1 text-blue-400 hover:text-blue-300 text-xs" title="Info">ℹ️</button>
    );

    const renderPenilaianForm = () => (
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button onClick={() => setExpertMode(false)} className={`px-3 py-1 rounded text-sm ${!expertMode ? 'bg-blue-600 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>🎯 Mode Mudah</button>
          <button onClick={() => setExpertMode(true)} className={`px-3 py-1 rounded text-sm ${expertMode ? 'bg-blue-600 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>🔧 Mode Ahli</button>
        </div>

        {/* IDENTITAS */}
        <div className="border border-blue-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-blue-300 mb-2">IDENTITAS</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={labelClass}>Isu Matrix (Korelasi)</label>
              <select className={selectClass} value={formData.isu_matrix_id || ''} onChange={(e) => {
                const isuId = e.target.value;
                if (isuId) {
                  const selected = isuData.find((i: any) => i.id === Number(isuId));
                  if (selected) {
                    setFormData((prev: any) => ({
                      ...prev,
                      isu_matrix_id: isuId,
                      nama_isu: selected.issues || prev.nama_isu,
                      risiko: selected.risks || prev.risiko,
                    }));
                  }
                } else {
                  setFormData({...formData, isu_matrix_id: ''});
                }
              }}>
                <option value="">-- Tidak ada --</option>
                {isuData.map((isu: any) => <option key={isu.id} value={isu.id}>{isu.issues?.substring(0, 60) || `Isu #${isu.id}`}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Nama Isu *</label><input className={inputClass} value={formData.nama_isu || ''} onChange={(e) => setFormData({...formData, nama_isu: e.target.value})} required /></div>
            <div><label className={labelClass}>Proses Bisnis</label><input className={inputClass} value={formData.proses_bisnis || ''} onChange={(e) => setFormData({...formData, proses_bisnis: e.target.value})} /></div>
            <div><label className={labelClass}>Asset/Aktivitas</label><input className={inputClass} value={formData.nama_asset || ''} onChange={(e) => setFormData({...formData, nama_asset: e.target.value})} /></div>
            <div><label className={labelClass}>Kerentanan</label><textarea className={inputClass} value={formData.kerentanan || ''} onChange={(e) => setFormData({...formData, kerentanan: e.target.value})} rows={2} /></div>
            <div><label className={labelClass}>Ancaman</label><textarea className={inputClass} value={formData.ancaman || ''} onChange={(e) => setFormData({...formData, ancaman: e.target.value})} rows={2} /></div>
            <div><label className={labelClass}>Risiko *</label><textarea className={inputClass} value={formData.risiko || ''} onChange={(e) => setFormData({...formData, risiko: e.target.value})} rows={2} required /></div>
            <div className="col-span-3"><label className={labelClass}>Akibat/Dampak</label><textarea className={inputClass} value={formData.akibat_dampak || ''} onChange={(e) => setFormData({...formData, akibat_dampak: e.target.value})} rows={2} /></div>
          </div>
        </div>

        {/* NILAI SEBELUM */}
        <div className="border border-teal-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-teal-300 mb-2">NILAI SEBELUM PENGENDALIAN <InfoPopup type="sebelum" /></h4>
          {showInfo === 'sebelum' && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 space-y-1">
              <p className="font-bold text-teal-300">Definisi Frekuensi:</p>
              {FREKUENSI_OPTIONS.map(f => <p key={f.value}>{f.value}. {f.label}</p>)}
              <p className="font-bold text-teal-300 mt-2">Definisi Dampak:</p>
              {DAMPAK_OPTIONS.map(d => <p key={d.value}>{d.value}. {d.label} ({d.label_finansial})</p>)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Frekuensi</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.frekuensi_sebelum || 1} onChange={(e) => updateFrekuensi('frekuensi_sebelum', Math.min(5, Math.max(1, Number(e.target.value))), '')} />
              ) : (
                <select className={selectClass} value={formData.frekuensi_sebelum_desc || ''} onChange={(e) => { const opt = FREKUENSI_OPTIONS.find(f => f.label === e.target.value); if (opt) updateFrekuensi('frekuensi_sebelum', opt.value, opt.label); }}>
                  <option value="">-- Pilih Deskripsi --</option>
                  {FREKUENSI_OPTIONS.map(f => <option key={f.value} value={f.label}>{f.value}. {f.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Dampak</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.dampak_sebelum || 1} onChange={(e) => updateDampak('dampak_sebelum', Math.min(5, Math.max(1, Number(e.target.value))), '', '')} />
              ) : (
                <select className={selectClass} value={formData.dampak_sebelum_desc || ''} onChange={(e) => { const opt = DAMPAK_OPTIONS.find(d => d.label === e.target.value); if (opt) updateDampak('dampak_sebelum', opt.value, opt.label, opt.label_finansial); }}>
                  <option value="">-- Pilih Deskripsi --</option>
                  {DAMPAK_OPTIONS.map(d => <option key={d.value} value={d.label}>{d.value}. {d.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Nilai Risiko Dasar</label>
              <div className={`px-3 py-2 rounded-lg text-sm font-bold border ${getRiskLevel((formData.frekuensi_sebelum || 0) * (formData.dampak_sebelum || 0)).bg} ${getRiskLevel((formData.frekuensi_sebelum || 0) * (formData.dampak_sebelum || 0)).text} ${getRiskLevel((formData.frekuensi_sebelum || 0) * (formData.dampak_sebelum || 0)).border}`}>
                {(formData.frekuensi_sebelum || 0) * (formData.dampak_sebelum || 0)} - {getRiskLevel((formData.frekuensi_sebelum || 0) * (formData.dampak_sebelum || 0)).label}
              </div>
            </div>
          </div>
        </div>

        {/* PENGENDALIAN DINI */}
        <div className="border border-orange-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-orange-300 mb-2">PENGENDALIAN DINI</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={labelClass}>Pengendalian yang ada</label><textarea className={inputClass} value={formData.pengendalian_yang_ada || ''} onChange={(e) => setFormData({...formData, pengendalian_yang_ada: e.target.value})} rows={2} /></div>
            <div><label className={labelClass}>Pemilihan Kontrol</label><textarea className={inputClass} value={formData.pemilihan_kontrol || ''} onChange={(e) => setFormData({...formData, pemilihan_kontrol: e.target.value})} rows={2} /></div>
          </div>
        </div>

        {/* NILAI SESUDAH */}
        <div className="border border-yellow-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-yellow-300 mb-2">NILAI SETELAH PENGENDALIAN</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Frekuensi</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.frekuensi_sesudah || 1} onChange={(e) => updateFrekuensi('frekuensi_sesudah', Math.min(5, Math.max(1, Number(e.target.value))), '')} />
              ) : (
                <select className={selectClass} value={formData.frekuensi_sesudah_desc || ''} onChange={(e) => { const opt = FREKUENSI_OPTIONS.find(f => f.label === e.target.value); if (opt) updateFrekuensi('frekuensi_sesudah', opt.value, opt.label); }}>
                  <option value="">-- Pilih --</option>
                  {FREKUENSI_OPTIONS.map(f => <option key={f.value} value={f.label}>{f.value}. {f.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Dampak</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.dampak_sesudah || 1} onChange={(e) => updateDampak('dampak_sesudah', Math.min(5, Math.max(1, Number(e.target.value))), '', '')} />
              ) : (
                <select className={selectClass} value={formData.dampak_sesudah_desc || ''} onChange={(e) => { const opt = DAMPAK_OPTIONS.find(d => d.label === e.target.value); if (opt) updateDampak('dampak_sesudah', opt.value, opt.label, opt.label_finansial); }}>
                  <option value="">-- Pilih --</option>
                  {DAMPAK_OPTIONS.map(d => <option key={d.value} value={d.label}>{d.value}. {d.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Nilai Risiko Sisa</label>
              <div className={`px-3 py-2 rounded-lg text-sm font-bold ${getRiskLevel((formData.frekuensi_sesudah || 0) * (formData.dampak_sesudah || 0)).bg} ${getRiskLevel((formData.frekuensi_sesudah || 0) * (formData.dampak_sesudah || 0)).text}`}>
                {(formData.frekuensi_sesudah || 0) * (formData.dampak_sesudah || 0)} - {getRiskLevel((formData.frekuensi_sesudah || 0) * (formData.dampak_sesudah || 0)).label}
              </div>
            </div>
          </div>
        </div>

        {/* RENCANA TAMBAHAN */}
        <div className="border border-red-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-red-300 mb-2">RENCANA PENGENDALIAN TAMBAHAN</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={labelClass}>Pengendalian Tambahan</label><textarea className={inputClass} value={formData.pengendalian_tambahan || ''} onChange={(e) => setFormData({...formData, pengendalian_tambahan: e.target.value})} rows={2} /></div>
            <div><label className={labelClass}>Kebutuhan Sumber Daya</label><textarea className={inputClass} value={formData.kebutuhan_sumber_daya || ''} onChange={(e) => setFormData({...formData, kebutuhan_sumber_daya: e.target.value})} rows={2} /></div>
            <div><label className={labelClass}>Penanggung Jawab</label><input className={inputClass} value={formData.penanggung_jawab || ''} onChange={(e) => setFormData({...formData, penanggung_jawab: e.target.value})} /></div>
            <div>
              <label className={labelClass}>Target Waktu - Tipe</label>
              <select className={selectClass} value={formData.target_waktu_type || 'date'} onChange={(e) => setFormData({...formData, target_waktu_type: e.target.value})}>
                <option value="date">Tanggal</option>
                <option value="quarter">Kuartal</option>
              </select>
            </div>
            {formData.target_waktu_type === 'quarter' ? (
              <>
                <div><label className={labelClass}>Kuartal</label>
                  <select className={selectClass} value={formData.target_quarter || ''} onChange={(e) => setFormData({...formData, target_quarter: e.target.value})}>
                    <option value="">-- Pilih --</option>
                    {QUARTER_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Tahun</label><input type="number" min={2024} max={2035} className={inputClass} value={formData.target_year || new Date().getFullYear()} onChange={(e) => setFormData({...formData, target_year: e.target.value})} /></div>
              </>
            ) : (
              <div className="col-span-2"><label className={labelClass}>Target Waktu (Tanggal)</label><input type="date" className={inputClass} value={(formData.target_waktu && !formData.target_waktu.startsWith('Q.')) ? formData.target_waktu : ''} onChange={(e) => setFormData({...formData, target_waktu: e.target.value})} /></div>
            )}
          </div>
        </div>

        {/* NILAI TARGET */}
        <div className="border border-green-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-green-300 mb-2">NILAI YANG DITARGETKAN</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Frekuensi</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.frekuensi_target || 1} onChange={(e) => updateFrekuensi('frekuensi_target', Math.min(5, Math.max(1, Number(e.target.value))), '')} />
              ) : (
                <select className={selectClass} value={formData.frekuensi_target_desc || ''} onChange={(e) => { const opt = FREKUENSI_OPTIONS.find(f => f.label === e.target.value); if (opt) updateFrekuensi('frekuensi_target', opt.value, opt.label); }}>
                  <option value="">-- Pilih --</option>
                  {FREKUENSI_OPTIONS.map(f => <option key={f.value} value={f.label}>{f.value}. {f.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Dampak</label>
              {expertMode ? (
                <input type="number" min={1} max={5} className={inputClass} value={formData.dampak_target || 1} onChange={(e) => updateDampak('dampak_target', Math.min(5, Math.max(1, Number(e.target.value))), '', '')} />
              ) : (
                <select className={selectClass} value={formData.dampak_target_desc || ''} onChange={(e) => { const opt = DAMPAK_OPTIONS.find(d => d.label === e.target.value); if (opt) updateDampak('dampak_target', opt.value, opt.label, opt.label_finansial); }}>
                  <option value="">-- Pilih --</option>
                  {DAMPAK_OPTIONS.map(d => <option key={d.value} value={d.label}>{d.value}. {d.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Nilai Target</label>
              <div className={`px-3 py-2 rounded-lg text-sm font-bold ${getRiskLevel((formData.frekuensi_target || 0) * (formData.dampak_target || 0)).bg} ${getRiskLevel((formData.frekuensi_target || 0) * (formData.dampak_target || 0)).text}`}>
                {(formData.frekuensi_target || 0) * (formData.dampak_target || 0)} - {getRiskLevel((formData.frekuensi_target || 0) * (formData.dampak_target || 0)).label}
              </div>
            </div>
          </div>
        </div>

        {/* PENINJAUAN */}
        <div className="border border-purple-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-purple-300 mb-2">PENINJAUAN RTP</h4>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelClass}>Tanggal Peninjauan</label><input type="date" className={inputClass} value={formData.tanggal_peninjauan || ''} onChange={(e) => setFormData({...formData, tanggal_peninjauan: e.target.value})} /></div>
            <div><label className={labelClass}>Status Pelaksanaan</label>
              <select className={selectClass} value={formData.status_pelaksanaan || 'Belum Dimulai'} onChange={(e) => setFormData({...formData, status_pelaksanaan: e.target.value})}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    );

    const renderInterestedForm = () => (
      <div className="space-y-3">
        <div><label className={labelClass}>Interested Parties</label><input className={inputClass} value={formData.interested_party || ''} onChange={(e) => setFormData({...formData, interested_party: e.target.value})} /></div>
        <div><label className={labelClass}>Needs</label><textarea className={inputClass} value={formData.needs || ''} onChange={(e) => setFormData({...formData, needs: e.target.value})} rows={2} /></div>
        <div><label className={labelClass}>Expectations</label><textarea className={inputClass} value={formData.expectations || ''} onChange={(e) => setFormData({...formData, expectations: e.target.value})} rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Risk</label>
            <select className={selectClass} value={formData.risk || 'Low'} onChange={(e) => setFormData({...formData, risk: e.target.value})}>
              {['Low', 'Medium', 'High'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label className={labelClass}>Opportunity</label>
            <select className={selectClass} value={formData.opportunity || 'Low'} onChange={(e) => setFormData({...formData, opportunity: e.target.value})}>
              {['Low', 'Medium', 'High'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>
    );

    const renderPeluangForm = () => (
      <div className="space-y-3">
        <div><label className={labelClass}>Opportunities</label><textarea className={inputClass} value={formData.opportunities || ''} onChange={(e) => setFormData({...formData, opportunities: e.target.value})} rows={2} /></div>

        <div className="border border-green-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-green-300 mb-2">MANFAAT (BENEFIT) <InfoPopup type="manfaat" /></h4>
          {showInfo === 'manfaat' && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 space-y-1">
              {MANFAAT_OPTIONS.map(m => (
                <div key={m.value}><p className="font-bold text-green-300">Level {m.value} ({m.label}):</p>
                  {m.descriptions.map((d, i) => <p key={i}>• {d}</p>)}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Manfaat - Keadaan yang diharapkan</label>
              <textarea className={inputClass} value={formData.manfaat_diharapkan || ''} onChange={(e) => setFormData({...formData, manfaat_diharapkan: e.target.value})} rows={2} />
              <select className={`${selectClass} mt-1`} value={formData.manfaat_diharapkan_desc || ''} onChange={(e) => {
                for (const m of MANFAAT_OPTIONS) {
                  if (m.descriptions.includes(e.target.value)) { updateManfaat('manfaat_diharapkan', m.value, e.target.value); return; }
                }
              }}>
                <option value="">-- Pilih Deskripsi Manfaat --</option>
                {MANFAAT_OPTIONS.map(m => m.descriptions.map((d, i) => <option key={`${m.value}-${i}`} value={d}>[Level {m.value}] {d}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Manfaat - Keadaan saat ini</label>
              <textarea className={inputClass} value={formData.manfaat_saat_ini || ''} onChange={(e) => setFormData({...formData, manfaat_saat_ini: e.target.value})} rows={2} />
              <select className={`${selectClass} mt-1`} value={formData.manfaat_saat_ini_desc || ''} onChange={(e) => {
                for (const m of MANFAAT_OPTIONS) {
                  if (m.descriptions.includes(e.target.value)) { updateManfaat('manfaat_saat_ini', m.value, e.target.value); return; }
                }
              }}>
                <option value="">-- Pilih Deskripsi Manfaat --</option>
                {MANFAAT_OPTIONS.map(m => m.descriptions.map((d, i) => <option key={`${m.value}-${i}`} value={d}>[Level {m.value}] {d}</option>))}
              </select>
            </div>
          </div>
        </div>

        <div className="border border-orange-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-orange-300 mb-2">SUMBER DAYA <InfoPopup type="sumberdaya" /></h4>
          {showInfo === 'sumberdaya' && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 space-y-1">
              {SUMBER_DAYA_OPTIONS.map(s => <p key={s.value}>{s.value}. {s.label}: {s.description}</p>)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Kebutuhan Sumber Daya</label>
              <textarea className={inputClass} value={formData.kebutuhan_sumber_daya || ''} onChange={(e) => setFormData({...formData, kebutuhan_sumber_daya: e.target.value})} rows={2} />
              <select className={`${selectClass} mt-1`} value={formData.sumber_daya_desc || ''} onChange={(e) => { const opt = SUMBER_DAYA_OPTIONS.find(s => s.description === e.target.value); if (opt) updateSumberDaya(opt.value, opt.description); }}>
                <option value="">-- Pilih Deskripsi --</option>
                {SUMBER_DAYA_OPTIONS.map(s => <option key={s.value} value={s.description}>[Level {s.value}] {s.label}: {s.description}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Opportunity Grade (Auto)</label>
              {formData.opportunity_grade ? (
                <div className={`px-3 py-2 rounded-lg text-sm font-bold ${OPPORTUNITY_GRADES[formData.opportunity_grade]?.bg || 'bg-gray-100 dark:bg-gray-700'} ${OPPORTUNITY_GRADES[formData.opportunity_grade]?.text || 'text-gray-700 dark:text-gray-300'}`}>
                  {formData.opportunity_grade} - {formData.opportunity_grade_label}
                </div>
              ) : (
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-400 dark:text-gray-500 dark:text-gray-400 text-sm">Pilih Manfaat & Sumber Daya</div>
              )}
            </div>
          </div>
        </div>

        <div className="border border-blue-800 rounded-lg p-3">
          <h4 className="text-sm font-bold text-blue-300 mb-2">ACTION PLAN</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>What</label><input className={inputClass} value={formData.action_plan_what || ''} onChange={(e) => setFormData({...formData, action_plan_what: e.target.value})} /></div>
            <div><label className={labelClass}>Resources</label><input className={inputClass} value={formData.action_plan_resources || ''} onChange={(e) => setFormData({...formData, action_plan_resources: e.target.value})} /></div>
            <div><label className={labelClass}>Who</label><input className={inputClass} value={formData.action_plan_who || ''} onChange={(e) => setFormData({...formData, action_plan_who: e.target.value})} /></div>
            <div><label className={labelClass}>When</label><input className={inputClass} value={formData.action_plan_when || ''} onChange={(e) => setFormData({...formData, action_plan_when: e.target.value})} /></div>
            <div className="col-span-2"><label className={labelClass}>How Result Evaluated</label><textarea className={inputClass} value={formData.action_plan_how || ''} onChange={(e) => setFormData({...formData, action_plan_how: e.target.value})} rows={2} /></div>
          </div>
        </div>
        <div><label className={labelClass}>Keterangan</label><textarea className={inputClass} value={formData.keterangan || ''} onChange={(e) => setFormData({...formData, keterangan: e.target.value})} rows={2} /></div>
      </div>
    );

    const renderIsuForm = () => (
      <div className="space-y-3">
        <div><label className={labelClass}>Kategori</label>
          <select className={selectClass} value={formData.kategori || 'Internal'} onChange={(e) => setFormData({...formData, kategori: e.target.value})}>
            {KATEGORI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div><label className={labelClass}>Issues</label><textarea className={inputClass} value={formData.issues || ''} onChange={(e) => setFormData({...formData, issues: e.target.value})} rows={3} /></div>
        <div><label className={labelClass}>Risks</label><textarea className={inputClass} value={formData.risks || ''} onChange={(e) => setFormData({...formData, risks: e.target.value})} rows={3} /></div>
        <div><label className={labelClass}>Opportunities</label><textarea className={inputClass} value={formData.opportunities || ''} onChange={(e) => setFormData({...formData, opportunities: e.target.value})} rows={3} /></div>
      </div>
    );

    const formRenderers: Record<TabType, () => React.ReactNode> = {
      penilaian: renderPenilaianForm, interested: renderInterestedForm,
      peluang: renderPeluangForm, isu: renderIsuForm,
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
          <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingItem ? '✏️ Edit' : '➕ Add'} - {tabs.find(t => t.key === activeTab)?.label}</h3>
            <button onClick={() => setShowModal(false)} className="text-gray-400 dark:text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white text-xl">✕</button>
          </div>
          <div className="p-4">{formRenderers[activeTab]()}</div>
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 flex gap-2 justify-end">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-600">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-gray-900 dark:text-white rounded-lg hover:bg-blue-700 font-medium">💾 {editingItem ? 'Update' : 'Save'}</button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================
  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚖️ Risk Assessment</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExport} className="px-4 py-2 rounded-lg font-medium bg-green-600 text-gray-900 dark:text-white hover:bg-green-700 text-sm">📊 Export Excel</button>
          <label className="px-4 py-2 rounded-lg font-medium bg-purple-600 text-gray-900 dark:text-white hover:bg-purple-700 text-sm cursor-pointer">
            📥 Import Excel<input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={openAddModal} className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-gray-900 dark:text-white hover:bg-blue-700 text-sm">➕ Add Data</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {dashboardCards.map((card, idx) => (
          <div key={idx} className={`${card.color} p-4 rounded-lg text-left`}>
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className="text-sm text-gray-500 dark:text-white/80">{card.label}</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-4 bg-white dark:bg-gray-800 p-1 rounded-lg">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(1); setSearchQuery(''); setStatusFilter(''); setKategoriFilter(''); }} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === tab.key ? 'bg-blue-600 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:bg-gray-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <input type="text" placeholder="🔍 Search..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
        </div>
        {activeTab === 'penilaian' && (
          <>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
              <option value="">All Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={riskLevelFilter} onChange={(e) => { setRiskLevelFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
              <option value="">All Risk Levels</option>
              <option value="Tinggi">Tinggi (≥10)</option>
              <option value="Sedang">Sedang (5-9)</option>
              <option value="Rendah">{'Rendah (<5)'}</option>
            </select>
            <button
              onClick={() => setOverdueFilter(!overdueFilter)}
              className={`px-3 py-2 border rounded-lg text-sm ${overdueFilter ? 'bg-red-600 border-red-600 text-gray-900 dark:text-white' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
            >
              {overdueFilter ? '🔴 Overdue Only' : '⏰ Overdue'}
            </button>
          </>
        )}
        {activeTab === 'isu' && (
          <select value={kategoriFilter} onChange={(e) => { setKategoriFilter(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
            <option value="">All Kategori</option>
            {KATEGORI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        {loading ? <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div> : (
          <>
            {activeTab === 'penilaian' && renderPenilaianRisiko()}
            {activeTab === 'interested' && renderInterestedParties()}
            {activeTab === 'peluang' && renderPeluang()}
            {activeTab === 'isu' && renderIsuMatrix()}
          </>
        )}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">Showing {penilaianData.length} of {pagination.total_records} entries</div>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button onClick={() => setPage(1)} disabled={!pagination.has_prev} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">««</button>
              <button onClick={() => setPage(page - 1)} disabled={!pagination.has_prev} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">«</button>
              <span className="text-sm px-2 text-gray-700 dark:text-gray-300">Page {page} of {pagination.total_pages || 1}</span>
              <button onClick={() => setPage(page + 1)} disabled={!pagination.has_next} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">»</button>
              <button onClick={() => setPage(pagination.total_pages)} disabled={!pagination.has_next} className="px-2 py-1 text-sm rounded disabled:opacity-50 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">»»</button>
            </div>
          </div>
        </div>
      </div>

      {renderModal()}
    </div>
  );
}
