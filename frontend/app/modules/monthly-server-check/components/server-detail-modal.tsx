"use client";

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/auth';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { monthFull, isRunningMonth, slaVerdict, SLA_NOTE } from '@/lib/sla-status';

// Helper for CSV Export
const downloadCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface NetworkInterfaceDetail {
  interface_name: string;
  speed: string;
  total_rx: string;
  total_tx: string;
  total_packet_drop: number;
  internet_status: string;
  ip_address: string;
  mac_address: string;
}

interface DailyRecord {
  tanggal: string;
  status: string;
  alert_reason: string | null;
  cpu_peak: number;
  cpu_peak_time?: string | null;
  cpu_peak_max?: number | null;
  cpu_user_avg?: number;
  cpu_system_avg?: number;
  ram_peak: number;
  ram_peak_time?: string | null;
  ram_peak_max?: number | null;
  ram_avg: number;
  disk_root_pct: number;
  disk_data_pct: number;
  disk_data_label: string;
  disk_usr_local_syb_pct?: number | null;
  net_rx_peak?: number;
  net_tx_peak?: number;
  net_rx_total?: string;
  net_tx_total?: string;
  packet_drop_total?: number;
  internet_status?: string;
  network_interfaces?: NetworkInterfaceDetail[];
  peak_description?: string | null;
}

interface PartitionSummary {
  mount_point: string;
  current_use_pct: number;
  min_pct: number;
  max_pct: number;
  avg_pct: number;
}

interface ProjectionData {
  partition: string;
  type?: 'cpu' | 'ram' | 'disk';
  current_use_pct: number;
  status: string;
  slope_per_day: number;
  r_squared: number;
  days_to_threshold: number | null;
  threshold_date: string | null;
  threshold: number;
  prediction_1m: number;
  prediction_3m: number;
  prediction_6m: number;
  prediction_12m: number;
  urgency: string;
  recommendation: string;
  actions?: string[];
  trend: string;
  confidence: string;
  data_quality_warning: boolean;
  data_points: number;
  message?: string;
  data_range?: {
    first_date: string;
    last_date: string;
    total_days: number;
  };
}

interface ServerDetailModalProps {
  hostname: string;
  onClose: () => void;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function ServerDetailModal({ hostname, onClose }: ServerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'charts' | 'projection' | 'info'>('history');
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [partitionSummary, setPartitionSummary] = useState<PartitionSummary[]>([]);
  const [projections, setProjections] = useState<ProjectionData[]>([]);
  const [overallStatus, setOverallStatus] = useState<string>('safe');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [sla, setSla] = useState<{ month?: string; days_of_data?: number; days_in_month?: number; days_monitored?: number; days_no_data?: number; coverage_pct?: number } | null>(null);
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [infoDate, setInfoDate] = useState<string | null>(null);
  const [serverSLARows, setServerSLARows] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  const slaRange = () => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 364 * 86400000).toISOString().split('T')[0];
    return { from, to };
  };

  const mapSlaStatus = (s: string) => (s === 'OK' ? 'ok' : s === 'WARNING' ? 'warning' : 'critical');

  const toggleRowExpand = (idx: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadData();
  }, [hostname, page, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'history') {
        const result = await apiRequest(`/api/capacity-planning/servers/${hostname}/history?page=${page}&page_size=30`);
        setRecords(result.data);
        setPagination(result.pagination);
      } else if (activeTab === 'charts') {
        const [historyResult, partResult] = await Promise.all([
          apiRequest(`/api/capacity-planning/servers/${hostname}/history?page=1&page_size=30`),
          apiRequest(`/api/capacity-planning/servers/${hostname}/partitions/summary`)
        ]);
        setRecords(historyResult.data);
        setPartitionSummary(partResult.partitions);
      } else if (activeTab === 'info') {
        const result = await apiRequest(`/api/capacity-planning/servers/${hostname}/interfaces`);
        setServerInfo(result.server_info);
        setSla(result.sla || null);
        setInterfaces(result.interfaces || []);
        setInfoDate(result.latest_date);
        const slaRes = await apiRequest(`/api/v1/capacity-reports/sla-export?from_date=${slaRange().from}&to_date=${slaRange().to}`).catch(() => ({ rows: [] }));
        setServerSLARows((slaRes.rows || []).filter((r: any) => r.hostname === hostname));
      } else {
        // Projection tab
        try {
          const projResult = await apiRequest(`/api/capacity-planning/servers/${hostname}/projection`);
          setProjections(projResult.projections || []);
          setOverallStatus(projResult.overall_status || 'no_data');
        } catch (err) {
          // Silently handle - no data yet is not an error
          setProjections([]);
          setOverallStatus('no_data');
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ================= EXPORT FUNCTIONS =================

  const handleExportCSV = async () => {
    if (records.length === 0) return;
    try {
      // Fetch all data for export (ignore pagination)
      const allDataRes = await apiRequest(`/api/capacity-planning/servers/${hostname}/history?page=1&page_size=1000`);
      const data = allDataRes.data;
      
      const csvData = data.map((r: any) => ({
        Tanggal: r.tanggal,
        Status: r.status,
        'CPU Peak (%)': r.cpu_peak_max ?? r.cpu_peak,
        'CPU Peak Time': r.cpu_peak_time || '-',
        'CPU User Avg (%)': r.cpu_user_avg,
        'RAM Peak (%)': r.ram_peak,
        'RAM Peak Time': r.ram_peak_time || '-',
        'RAM Avg (%)': r.ram_avg,
        'Disk / (%)': r.disk_root_pct,
        [`Disk ${r.disk_data_label || '/Backup'} (%)`]: r.disk_data_pct,
        'Net RX Peak': r.net_rx_peak,
        'Net TX Peak': r.net_tx_peak,
        'Peak Description': r.peak_description || '-'
      }));

      const fileName = `Laporan_Kapasitas_${hostname}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csvData, fileName);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Gagal mengekspor CSV');
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Unified typography scale for the PDF report
      const F: Record<string, number> = {
        title: 18,
        subtitle: 10,
        meta: 9,
        info: 9.5,
        section: 11,
        cardLabel: 8,
        cardValue: 12,
        table: 7.5,
        note: 8,
        recTitle: 9,
        footer: 7,
      };

      let exportRecords = records;
      if (exportRecords.length === 0) {
        const historyRes = await apiRequest(`/api/capacity-planning/servers/${hostname}/history?page=1&page_size=30`);
        exportRecords = historyRes.data || [];
      }
      const projRes = await apiRequest(`/api/capacity-planning/servers/${hostname}/projection`).catch(() => ({ projections: [] }));
      const exportProjections: ProjectionData[] = projRes.projections || [];
      const infoRes = await apiRequest(`/api/capacity-planning/servers/${hostname}/interfaces`).catch(() => null);
      let exportSLARows = serverSLARows;
      if (exportSLARows.length === 0) {
        const slaRes = await apiRequest(`/api/v1/capacity-reports/sla-export?from_date=${slaRange().from}&to_date=${slaRange().to}`).catch(() => ({ rows: [] }));
        exportSLARows = (slaRes.rows || []).filter((r: any) => r.hostname === hostname);
      }

      // ── HEADER ──────────────────────────────────────────
      doc.setFillColor(36, 72, 141); // Navy blue
      doc.rect(0, 0, pageWidth, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(F.title);
      doc.text('LAPORAN KAPASITAS SERVER', 14, 16);
      doc.setFontSize(F.subtitle);
      doc.text(`${hostname}`, 14, 26);

      doc.setFontSize(F.meta);
      doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - 14, 16, { align: 'right' });
      doc.text('Sistem Manajemen TI Terintegrasi — Server Capacity Monitoring (SAR)', pageWidth - 14, 26, { align: 'right' });

      // ── SERVER INFO LINE ────────────────────────────────
      const infoSrv = infoRes?.server_info || {};
      const infoSla = infoRes?.sla || {};
      if (infoSrv.uptime || infoSrv.cpu) {
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(F.info);
        const cleanInfo = (s: string) => String(s || '-').replace(/[^\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const slaVal = infoSla.coverage_pct != null ? `${infoSla.coverage_pct.toFixed(2)}% (${infoSla.days_of_data}/${infoSla.days_monitored ?? infoSla.days_in_month} hari)` : '-';
        doc.text(`OS: ${cleanInfo(infoSrv.os)} | Uptime (saat ini): ${cleanInfo(infoSrv.uptime || 'N/A')} | SLA ${infoSla.month || ''}: ${slaVal}`, 14, 36);
        doc.setFontSize(F.section);
      }

      // ── SUMMARY CARDS ──────────────────────────────────
      let y = (infoSrv.uptime || infoSrv.cpu) ? 44 : 40;
      if (exportRecords.length > 0) {
        doc.setTextColor(0);
        doc.setFontSize(F.section);
        doc.text('Ringkasan', 14, y);
        y += 2;

        const avgCpu = (exportRecords.reduce((a, b) => a + b.cpu_peak, 0) / exportRecords.length).toFixed(2);
        const avgRam = (exportRecords.reduce((a, b) => a + b.ram_peak, 0) / exportRecords.length).toFixed(2);
        const avgDisk = (exportRecords.reduce((a, b) => a + b.disk_root_pct, 0) / exportRecords.length).toFixed(2);
        const minRam = Math.min(...exportRecords.map(r => r.ram_peak)).toFixed(2);
        const maxRam = Math.max(...exportRecords.map(r => r.ram_peak)).toFixed(2);
        const minCpu = Math.min(...exportRecords.map(r => r.cpu_peak)).toFixed(2);
        const maxCpu = Math.max(...exportRecords.map(r => r.cpu_peak)).toFixed(2);
        const latest = exportRecords[0];

        const colWidth = (pageWidth - 28) / 3;
        const cardHeight = 22;

        const makeCard = (label: string, value: string, x: number, yy: number) => {
          doc.setFillColor(245, 245, 250);
          doc.roundedRect(x, yy, colWidth, cardHeight, 2, 2, 'F');
          doc.setDrawColor(200);
          doc.roundedRect(x, yy, colWidth, cardHeight, 2, 2, 'S');
          doc.setFontSize(F.cardLabel);
          doc.setTextColor(120);
          doc.setFont('helvetica', 'normal');
          doc.text(label, x + 4, yy + 9);
          doc.setFontSize(F.cardValue);
          doc.setTextColor(36, 72, 141);
          doc.setFont('helvetica', 'bold');
          doc.text(value, x + 4, yy + 18);
          doc.setFont('helvetica', 'normal');
        };

        const diskLabel = secondaryDiskLabel || '-';
        const diskAvg2 = secondaryDiskLabel ? (exportRecords.reduce((a, b) => a + b.disk_data_pct, 0) / exportRecords.length).toFixed(2) : 'N/A';

        makeCard('CPU Peak (Avg)', `${avgCpu}% (Min: ${minCpu}%, Max: ${maxCpu}%)`, 14, y + 4);
        makeCard('RAM Peak (Avg)', `${avgRam}% (Min: ${minRam}%, Max: ${maxRam}%)`, 14 + colWidth + 6, y + 4);
        makeCard('Disk Usage', `/: ${avgDisk}%  |  ${diskLabel}: ${diskAvg2}%`, 14 + (colWidth + 6) * 2, y + 4);

        y += cardHeight + 8;

        if (latest.peak_description) {
          doc.setFontSize(F.note);
          doc.setTextColor(60, 60, 120);
          doc.setFont('helvetica', 'italic');
          const descLines = doc.splitTextToSize(`Peak 24 Jam: ${latest.peak_description}`, pageWidth - 28);
          doc.text(descLines, 14, y + 2);
          y += descLines.length * 4 + 4;
          doc.setFont('helvetica', 'normal');
        } else {
          y += 4;
        }
      } else {
        y += 6;
      }

      // ── TABLE ──────────────────────────────────────────
      if (exportRecords.length > 0) {
        const hasSecDisk = secondaryDiskLabel && exportRecords.some(r => r.disk_data_pct > 0);
        const headers = [
          'Tanggal',
          'Status',
          'CPU Peak',
          'Jam Peak CPU',
          'CPU User',
          'RAM Peak',
          'Jam Peak RAM',
          'RAM Avg',
          'Disk /',
        ];
        if (hasSecDisk) headers.push(`Disk ${secondaryDiskLabel}`);

        const body = exportRecords.map(r => {
          const row: (string | number)[] = [
            r.tanggal,
            r.status.toUpperCase(),
            `${(r.cpu_peak_max ?? r.cpu_peak).toFixed(2)}%`,
            r.cpu_peak_time || '-',
            r.cpu_user_avg?.toFixed(2) ?? '-',
            `${r.ram_peak.toFixed(2)}%`,
            r.ram_peak_time || '-',
            `${r.ram_avg.toFixed(2)}%`,
            `${r.disk_root_pct.toFixed(2)}%`,
          ];
          if (hasSecDisk) row.push(`${r.disk_data_pct.toFixed(2)}%`);
          return row;
        });

        autoTable(doc, {
          startY: y,
          head: [headers],
          body,
          theme: 'grid',
          styles: {
            fontSize: F.table,
            cellPadding: 2,
            valign: 'middle',
          },
          headStyles: {
            fillColor: [36, 72, 141],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
          },
          alternateRowStyles: { fillColor: [245, 245, 250] },
          columnStyles: {
            0: { halign: 'center' },
            1: {
              halign: 'center',
              fontStyle: 'bold',
            },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'center' },
            ...(hasSecDisk ? { 9: { halign: 'center' } } : {}),
          },
          didParseCell: function (data) {
            // Color status cells
            if (data.column.index === 1 && data.section === 'body') {
              const val = data.cell.raw;
              if (val === 'CRITICAL') {
                (data.cell as any).styles.textColor = [220, 38, 38];
                (data.cell as any).styles.fillColor = [254, 226, 226];
              } else if (val === 'WARNING') {
                (data.cell as any).styles.textColor = [202, 138, 4];
                (data.cell as any).styles.fillColor = [254, 249, 195];
              } else if (val === 'OK') {
                (data.cell as any).styles.textColor = [34, 139, 34];
                (data.cell as any).styles.fillColor = [209, 250, 209];
              }
            }
            // Highlight high values (>=90%) for percentage columns
            const pctColumns = [2, 4, 5, 7, 8];
            if (hasSecDisk) pctColumns.push(9);
            if (pctColumns.includes(data.column.index) && data.section === 'body') {
              const val = String(data.cell.raw).replace(/%/g, '');
              const num = parseFloat(val);
              if (!isNaN(num) && num >= 90) {
                (data.cell as any).styles.textColor = [220, 38, 38];
                (data.cell as any).styles.fontStyle = 'bold';
              }
            }
            // Skip highlighting for non-numeric cells (date, status)
            if ((data.column.index === 0 || data.column.index === 1) && data.section === 'body') {
              // Keep normal style for these
            }
          },
        });

        y = (doc as any).lastAutoTable.finalY + 14;
      }

      // ── PROYEKSI KAPASITAS ─────────────────────────────
      const pageHeight = doc.internal.pageSize.getHeight();

      // ── SLA PER BULAN ──────────────────────────────────
      if (exportSLARows.length > 0) {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(F.section);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text('SLA PER BULAN', 14, y);
        y += 7;
        const slaHeaders = ['Bulan', 'Hari Dipantau', 'Hari Data', 'Tanpa Data', 'SLA %', 'Status', 'Keterangan'];
        const slaBody = exportSLARows.map((r: any) => {
          const hasSla = r.coverage_pct != null;
          return [
            `${monthFull(r.year_month)}${isRunningMonth(r.year_month) ? ' (berjalan)' : ''}`,
            hasSla ? (r.days_monitored ?? r.days_in_month) : '—',
            hasSla ? r.days_of_data : '—',
            hasSla ? (r.days_no_data ?? r.days_down) : '—',
            hasSla ? `${r.coverage_pct.toFixed(2)}%` : '—',
            r.status || 'OK',
            slaVerdict(r.status),
          ];
        });
        autoTable(doc, {
          startY: y,
          head: [slaHeaders],
          body: slaBody,
          theme: 'grid',
          margin: { left: 14, right: 14 },
          styles: { fontSize: F.table, cellPadding: 2, valign: 'middle' },
          headStyles: { fillColor: [36, 72, 141], textColor: 255, fontStyle: 'bold', halign: 'center' },
          alternateRowStyles: { fillColor: [245, 245, 250] },
          columnStyles: {
            0: { halign: 'center', cellWidth: 54 },
            1: { halign: 'center', cellWidth: 30 },
            2: { halign: 'center', cellWidth: 22 },
            3: { halign: 'center', cellWidth: 22 },
            4: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
            5: { halign: 'center', cellWidth: 30, fontStyle: 'bold' },
            6: { halign: 'left', cellWidth: 87 },
          },
          didParseCell: function (data) {
            if (data.section !== 'body') return;
            if (data.column.index === 4) {
              const v = parseFloat(String(data.cell.raw));
              if (!isNaN(v)) {
                if (v < 95) {
                  (data.cell as any).styles.textColor = [220, 38, 38];
                  (data.cell as any).styles.fontStyle = 'bold';
                } else if (v < 99) {
                  (data.cell as any).styles.textColor = [202, 138, 4];
                } else {
                  (data.cell as any).styles.textColor = [34, 139, 34];
                }
              }
            }
            if (data.column.index === 5) {
              const s = String(data.cell.raw);
              if (s === 'KRITIS') {
                (data.cell as any).styles.textColor = [220, 38, 38];
                (data.cell as any).styles.fillColor = [254, 226, 226];
              } else if (s === 'WARNING') {
                (data.cell as any).styles.textColor = [202, 138, 4];
                (data.cell as any).styles.fillColor = [254, 249, 195];
              } else {
                (data.cell as any).styles.textColor = [34, 139, 34];
                (data.cell as any).styles.fillColor = [209, 250, 209];
              }
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 14;
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.setFont('helvetica', 'normal');
        const slaNote = 'Catatan: ' + SLA_NOTE + ' Uptime server hanya tersedia sejak script SAR baru (10-08-2026); sebelum tanggal itu = N/A.';
        const slaNoteLines = doc.splitTextToSize(slaNote, pageWidth - 28);
        doc.text(slaNoteLines, 14, y - 5);
      }

      const pdfClean = (s: string) => (s || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (exportProjections.length > 0) {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(F.section);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYEKSI KAPASITAS (Linear Regression)', 14, y);
        y += 7;
        exportProjections.forEach((proj) => {
          const isCpu = proj.type === 'cpu';
          const isRam = proj.type === 'ram';
          const title = isCpu ? 'CPU Usage'
            : isRam ? 'RAM Usage'
            : (proj.partition === '/' ? 'Root System (/)' : proj.partition);
          const isProjected = proj.status === 'projected';
          const urgency = proj.urgency === 'critical' || proj.urgency === 'warning' ? proj.urgency : 'safe';
          const urgencyLabel = urgency === 'critical' ? 'KRITIS' : urgency === 'warning' ? 'WASPADA' : 'AMAN';
          const statLabel = isProjected ? 'PROYEKSI' : 'STABIL/MENURUN';
          const urgencyColor: [number, number, number] = urgency === 'critical' ? [220, 38, 38] : urgency === 'warning' ? [202, 138, 4] : [34, 139, 34];
          const trendLabel = proj.trend === 'increasing' ? 'Naik' : proj.trend === 'decreasing' ? 'Turun' : 'Stabil';
          const confLabel = proj.confidence === 'high' ? 'Tinggi'
            : proj.confidence === 'medium' ? 'Sedang'
            : proj.confidence === 'low' ? 'Rendah' : 'Sangat rendah';
          const thresholdDate = isProjected && proj.threshold_date
            ? new Date(proj.threshold_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
          const daysToLimit = isProjected && proj.days_to_threshold != null ? `${proj.days_to_threshold} hari` : '—';

          autoTable(doc, {
            startY: y,
            head: [[{ content: `${title} — Status: ${statLabel} | Urgensi: ${urgencyLabel}`, colSpan: 2, styles: { halign: 'center' } }]],
            body: [
              ['Penggunaan Saat Ini', `${proj.current_use_pct.toFixed(2)}%`],
              ['Ambang Batas', `${proj.threshold.toFixed(2)}%`],
              ['Tren', trendLabel],
              ['Slope per Hari', `${proj.slope_per_day.toFixed(4)}`],
              ['Koefisien R²', proj.r_squared.toFixed(4)],
              ['Estimasi Capai Ambang', isProjected ? `${daysToLimit} (${thresholdDate})` : 'Belum diproyeksikan'],
              ['Prediksi 1 Bulan', `${proj.prediction_1m.toFixed(2)}%`],
              ['Prediksi 3 Bulan', `${proj.prediction_3m.toFixed(2)}%`],
              ['Prediksi 6 Bulan', `${proj.prediction_6m.toFixed(2)}%`],
              ['Prediksi 12 Bulan', `${proj.prediction_12m.toFixed(2)}%`],
              ['Confidence', confLabel],
              ['Data Points', `${proj.data_points} hari`],
              ['Rentang Data', proj.data_range ? `${proj.data_range.first_date} s/d ${proj.data_range.last_date} (${proj.data_range.total_days} hari)` : '—'],
            ],
            theme: 'grid',
            styles: { fontSize: F.table, cellPadding: 2, valign: 'middle' },
            headStyles: { fillColor: urgencyColor, textColor: 255, fontStyle: 'bold', halign: 'center' },
            columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;

          if (y > pageHeight - 40) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(F.recTitle);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(urgencyColor[0], urgencyColor[1], urgencyColor[2]);
          doc.text('Rekomendasi:', 14, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const recLines = doc.splitTextToSize(pdfClean(proj.recommendation) || '-', pageWidth - 28);
          if (y + 5 + recLines.length * 4 > pageHeight - 12) {
            doc.addPage();
            y = 20;
          }
          doc.text(recLines, 14, y + 5);
          y += 5 + recLines.length * 4;

          if (proj.actions && proj.actions.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(36, 72, 141);
            if (y + 6 > pageHeight - 12) {
              doc.addPage();
              y = 20;
            }
            doc.text('Langkah yang Direkomendasikan:', 14, y + 6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(60, 60, 60);
            proj.actions.forEach((action, ai) => {
              const actLines = doc.splitTextToSize(`${ai + 1}. ${pdfClean(action)}`, pageWidth - 28);
              if (y + 11 + actLines.length * 3.5 > pageHeight - 12) {
                doc.addPage();
                y = 20;
              }
              doc.text(actLines, 14, y + 11);
              y += 6 + actLines.length * 4;
            });
          }
          y += 6;
        });
      } else {
        y += 8;
        doc.setFontSize(F.meta);
        doc.setTextColor(120);
        doc.text('Proyeksi kapasitas belum tersedia — lakukan scan minimal 2 hari untuk menghasilkan proyeksi.', 14, y);
        y += 8;
      }

      // ── FOOTER ──────────────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(F.footer);
        doc.setTextColor(150);
        doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        doc.text(`Dokumen ini dihasilkan secara otomatis oleh Server Capacity Monitoring — ${hostname}`, 14, doc.internal.pageSize.getHeight() - 8);
        doc.setDrawColor(200);
        doc.line(14, doc.internal.pageSize.getHeight() - 12, pageWidth - 14, doc.internal.pageSize.getHeight() - 12);
      }

      const filename = `Laporan_Kapasitas_${hostname}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Gagal mengekspor PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical': return '🚨 Kritis';
      case 'warning': return '⚠️ Waspada';
      default: return '✅ Normal';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      default: return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    }
  };

  const getBarColor = (pct: number) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Derive secondary disk label from API response dynamically
  // Prefer /usr/local/syb when available; fallback to actual label from DB
  const deriveSecondaryLabel = (): string => {
    if (records.length === 0) return '/usr/local/syb';
    const actualLabel = records[0]?.disk_data_label;
    // For zfs-syb.local keep its actual label (/Backup)
    if (hostname === 'zfs-syb.local') return actualLabel || '/Backup';
    // For all other servers: prefer /usr/local/syb if the server has this partition
    const hasUsrLocalSyb = records.some(r => r.disk_data_label === '/usr/local/syb' && (r.disk_data_pct ?? 0) > 0);
    if (hasUsrLocalSyb) return '/usr/local/syb';
    // Fallback to whatever label is in the data
    return actualLabel || '/usr/local/syb';
  };
  const secondaryDiskLabel = deriveSecondaryLabel();
  const secondaryDiskKey = `Disk ${secondaryDiskLabel}`;

  // Prepare chart data
  const lineChartData = records.map(r => ({
    tanggal: new Date(r.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    'CPU Peak': r.cpu_peak_max ?? r.cpu_peak,
    'RAM Peak': r.ram_peak,
    'Disk /': r.disk_root_pct,
    [secondaryDiskKey]: r.disk_data_pct
  })).reverse();

  const partitionChartData = partitionSummary.map(p => ({
    name: p.mount_point === '/' ? 'Root (/)' : p.mount_point,
    value: p.current_use_pct
  }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl">
                {hostname.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📊 Detail Server: {hostname}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Visualisasi data penggunaan server</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {records.length > 0 && (
                <>
                  <button
                    onClick={handleExportCSV}
                    disabled={isExporting}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50 flex items-center gap-2"
                    title="Export ke Excel/CSV"
                  >
                    📄 CSV
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50 flex items-center gap-2"
                    title="Export ke PDF"
                  >
                    {isExporting ? '⏳ Loading...' : '📑 PDF'}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ✕ Tutup
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setActiveTab('history'); setPage(1); }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${activeTab === 'history' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'}`}
            >
              📋 Tabel Data
            </button>
            <button
              onClick={() => { setActiveTab('charts'); setPage(1); }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${activeTab === 'charts' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'}`}
            >
              📈 Grafik
            </button>
            <button
              onClick={() => { setActiveTab('projection'); setPage(1); }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors relative ${activeTab === 'projection' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'}`}
            >
              🔮 Proyeksi Kapasitas
              {overallStatus === 'critical' && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">!</span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab('info'); setPage(1); }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${activeTab === 'info' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'}`}
            >
              ℹ️ Informasi Server
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-6" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : activeTab === 'history' ? (
            <>
              {records.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-lg font-medium">Belum ada data riwayat</p>
                  <p className="text-sm mt-2">Lakukan scan data SAR terlebih dahulu</p>
                </div>
              ) : (
                <>
                  {records[0]?.peak_description && (
                    <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">📊</span>
                        <div>
                          <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Deskripsi Peak 24 Jam Terakhir</h4>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{records[0].peak_description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Data tanggal {new Date(records[0].tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 w-10"></th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Tanggal</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">CPU</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">RAM</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Disk /</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">{`Disk ${secondaryDiskLabel}`}</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Network RX</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Network TX</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Packet Drop</th>
                          <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300">Internet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, idx) => (
                          <>
                            <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                              <td className="px-2 py-2">
                                {record.network_interfaces && record.network_interfaces.length > 1 && (
                                  <button
                                    onClick={() => toggleRowExpand(idx)}
                                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-600 dark:text-blue-400 font-bold"
                                    title={expandedRows.has(idx) ? 'Collapse interfaces' : 'Expand interfaces'}
                                  >
                                    {expandedRows.has(idx) ? '−' : '+'}
                                  </button>
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs font-mono font-medium text-gray-900 dark:text-white">
                                {new Date(record.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </td>
                              <td className="px-2 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                                  {getStatusBadge(record.status)}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  <div className="w-12 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${getBarColor(record.cpu_peak_max ?? record.cpu_peak)}`} style={{ width: `${Math.min(record.cpu_peak_max ?? record.cpu_peak, 100)}%` }}></div>
                                  </div>
                                  <div className="text-xs">
                                    <span className="font-bold font-mono">{(record.cpu_peak_max ?? record.cpu_peak ?? 0).toFixed(1)}%</span>
                                    {record.cpu_peak_time && (
                                      <div className="text-blue-600 dark:text-blue-400">{record.cpu_peak_time}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  <div className="w-12 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${getBarColor(record.ram_peak)}`} style={{ width: `${Math.min(record.ram_peak, 100)}%` }}></div>
                                  </div>
                                  <div className="text-xs">
                                    <span className="font-bold font-mono">{(record.ram_peak ?? 0).toFixed(1)}%</span>
                                    {record.ram_peak_time && (
                                      <div className="text-purple-600 dark:text-purple-400">{record.ram_peak_time}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  <div className="w-12 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${getBarColor(record.disk_root_pct)}`} style={{ width: `${Math.min(record.disk_root_pct, 100)}%` }}></div>
                                  </div>
                                  <span className="text-xs font-bold font-mono">{record.disk_root_pct}%</span>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  <div className="w-12 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${getBarColor(record.disk_data_pct)}`} style={{ width: `${Math.min(record.disk_data_pct, 100)}%` }}></div>
                                  </div>
                                  <span className="text-xs font-bold font-mono">{record.disk_data_pct}%</span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                                {record.net_rx_total || '-'}
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                                {record.net_tx_total || '-'}
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                                {record.packet_drop_total || 0}
                              </td>
                              <td className="px-2 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${record.internet_status === 'TERHUBUNG' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                                  {record.internet_status === 'TERHUBUNG' ? '✅ Terhubung' : '❌ Tidak Terhubung'}
                                </span>
                              </td>
                            </tr>
                            {expandedRows.has(idx) && record.network_interfaces && record.network_interfaces.length > 1 && (
                              record.network_interfaces.map((iface, ifaceIdx) => (
                                <tr key={`${idx}-iface-${ifaceIdx}`} className="bg-gray-50 dark:bg-slate-800/50 border-l-4 border-l-blue-500">
                                  <td className="px-2 py-2"></td>
                                  <td className="px-2 py-2 pl-12 text-xs font-mono text-gray-700 dark:text-gray-300">
                                    {iface.interface_name}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                                    {iface.ip_address}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
                                    {iface.speed}
                                  </td>
                                  <td className="px-2 py-2"></td>
                                  <td className="px-2 py-2"></td>
                                  <td className="px-2 py-2"></td>
                                  <td className="px-2 py-2 text-xs text-blue-600 dark:text-blue-400 font-mono">
                                    {iface.total_rx}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-purple-600 dark:text-purple-400 font-mono">
                                    {iface.total_tx}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">
                                    {iface.total_packet_drop}
                                  </td>
                                  <td className="px-2 py-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${iface.internet_status === 'TERHUBUNG' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                                      {iface.internet_status === 'TERHUBUNG' ? '✅ Terhubung' : '❌ Tidak Terhubung'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {pagination && pagination.total_pages > 1 && (
                    <div className="mt-4 flex justify-between items-center">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Menampilkan {((pagination.page - 1) * pagination.page_size) + 1}-{Math.min(pagination.page * pagination.page_size, pagination.total_records)} dari {pagination.total_records} data
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.has_prev} className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">← Sebelumnya</button>
                        <span className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Halaman {pagination.page} / {pagination.total_pages}</span>
                        <button onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))} disabled={!pagination.has_next} className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600">Selanjutnya →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : activeTab === 'charts' ? (
            /* Charts Tab */
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {records.length > 0 && (
                  <>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                      <div className="text-sm opacity-90">Rata-rata CPU</div>
                      <div className="text-3xl font-bold">{(records.reduce((a, b) => a + b.cpu_peak, 0) / records.length).toFixed(1)}%</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                      <div className="text-sm opacity-90">Rata-rata RAM</div>
                      <div className="text-3xl font-bold">{(records.reduce((a, b) => a + b.ram_peak, 0) / records.length).toFixed(1)}%</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
                      <div className="text-sm opacity-90">Disk / Saat Ini</div>
                      <div className="text-3xl font-bold">{records[0]?.disk_root_pct}%</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
                      <div className="text-sm opacity-90">Total Data Points</div>
                      <div className="text-3xl font-bold">{pagination?.total_records || records.length}</div>
                    </div>
                  </>
                )}
              </div>

              {lineChartData.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">📊</div>
                  <p className="text-lg font-medium">Belum ada data untuk ditampilkan</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Line Chart: CPU & RAM Trends */}
                  <div className="bg-white dark:bg-slate-700 rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📈 Tren CPU & RAM (30 Hari Terakhir)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="tanggal" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                        <Legend />
                        <Line type="monotone" dataKey="CPU Peak" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="RAM Peak" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Line Chart: Disk Usage */}
                  <div className="bg-white dark:bg-slate-700 rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">💾 Tren Penggunaan Disk (30 Hari Terakhir)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="tanggal" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                        <Legend />
                        <Line type="monotone" dataKey="Disk /" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey={secondaryDiskKey} stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pie Chart: Disk Partition Distribution */}
                  {partitionChartData.length > 0 && (
                    <div className="bg-white dark:bg-slate-700 rounded-xl shadow-lg p-6">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">🥧 Distribusi Partisi Disk (Saat Ini)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={partitionChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {partitionChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-3">
                          <h4 className="font-bold text-gray-900 dark:text-white">Ringkasan Partisi:</h4>
                          {partitionSummary.map((part, idx) => (
                            <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-medium text-gray-900 dark:text-white">{part.mount_point === '/' ? 'Root (/)' : part.mount_point}</span>
                                <span className={`text-lg font-bold ${part.current_use_pct >= 90 ? 'text-red-600' : part.current_use_pct >= 80 ? 'text-yellow-600' : 'text-green-600'}`}>{part.current_use_pct}%</span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                <div className={`h-2 rounded-full ${getBarColor(part.current_use_pct)}`} style={{ width: `${Math.min(part.current_use_pct, 100)}%` }}></div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                                <div>Min: <strong>{part.min_pct}%</strong></div>
                                <div>Avg: <strong>{part.avg_pct.toFixed(1)}%</strong></div>
                                <div>Max: <strong>{part.max_pct}%</strong></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Combined Bar Chart: All Metrics */}
                  <div className="bg-white dark:bg-slate-700 rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">📊 Perbandingan Semua Metrik (7 Hari Terakhir)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={lineChartData.slice(-7)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="tanggal" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                        <Legend />
                        <Bar dataKey="CPU Peak" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="RAM Peak" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Disk /" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'projection' ? (
            /* Projection Tab */
            <>
              {overallStatus === 'no_data' || projections.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">🔮</div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">Belum ada data proyeksi</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Proyeksi akan muncul setelah scan data minimal 2 hari</p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    🚀 Lakukan Scan Terlebih Dahulu
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall Status Banner */}
                  <div className={`p-6 rounded-xl border-2 shadow-lg ${
                    overallStatus === 'critical' 
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                      : overallStatus === 'warning'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                      : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                  }`}>
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">
                        {overallStatus === 'critical' ? '🚨' : overallStatus === 'warning' ? '⚠️' : '✅'}
                      </span>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                          Status Keseluruhan: {overallStatus === 'critical' ? 'KRITIS' : overallStatus === 'warning' ? 'WASPADA' : 'AMAN'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {overallStatus === 'critical'
                            ? 'Ada resource (CPU/RAM/Disk) yang akan segera melewati batas! Tindakan segera diperlukan.'
                            : overallStatus === 'warning'
                            ? 'Beberapa resource mendekati batas. Rencanakan penambahan capacity.'
                            : 'Semua resource dalam kondisi aman. Tidak ada tindakan segera diperlukan.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Projection Cards */}
                  {projections.map((proj, idx) => {
                    const isCpu = proj.type === 'cpu';
                    const isRam = proj.type === 'ram';
                    const isDisk = !isCpu && !isRam;
                    const threshold = proj.threshold;
                    const partitionIcon = isCpu ? '🔲' : isRam ? '🧠' : (secondaryDiskLabel === '/Backup' ? '💾' : '📁');
                    const partitionTitle = isCpu ? 'CPU Peak Usage' : isRam ? 'RAM Peak Usage' : (proj.partition === '/' ? 'Root System (/)' : proj.partition);
                    const daysLabel = `Estimasi ${threshold}%`;
                    const dateLabel = `Tanggal ${threshold}%`;
                    const thresholdDateValue = proj.threshold_date;
                    const daysToLimit = proj.days_to_threshold;

                    const stat3mLevel = proj.prediction_3m;
                    const stat6mLevel = proj.prediction_6m;
                    const statColorLimit = isDisk ? 100 : threshold;

                    return (
                        <div key={idx} className={`bg-white dark:bg-slate-700 rounded-xl shadow-lg p-6 border-2 ${
                      proj.urgency === 'critical' ? 'border-red-300 dark:border-red-700' :
                      proj.urgency === 'warning' ? 'border-yellow-300 dark:border-yellow-700' :
                      'border-gray-200 dark:border-gray-600'
                    }`}>
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{partitionIcon}</span>
                          <div>
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                              {partitionTitle}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {proj.data_points} hari data • Tren: {proj.trend === 'increasing' ? '📈 Naik' : proj.trend === 'decreasing' ? '📉 Turun' : '➡️ Stabil'}
                              {isDisk && secondaryDiskLabel && !isCpu && !isRam && ` (${secondaryDiskLabel})`}
                            </p>
                          </div>
                        </div>
                        <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                          proj.urgency === 'critical' ? 'bg-red-500 text-white' :
                          proj.urgency === 'warning' ? 'bg-yellow-500 text-white' :
                          'bg-green-500 text-white'
                        }`}>
                          {proj.urgency === 'critical' ? '🚨 KRITIS' : proj.urgency === 'warning' ? '⚠️ WASPADA' : '✅ AMAN'}
                        </span>
                      </div>

                      {/* Current Usage */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Penggunaan Saat Ini:</span>
                          <span className="text-2xl font-bold">{proj.current_use_pct}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-4">
                          <div
                            className={`h-4 rounded-full ${
                              proj.current_use_pct >= 90 ? 'bg-red-500' :
                              proj.current_use_pct >= 80 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(proj.current_use_pct, 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Projection Details */}
                      {(() => {
                        const isProjected = proj.status === 'projected';
                        const isStable = proj.status === 'stable_or_decreasing';

                        return (
                        <div className="space-y-4">
                          {isProjected && (
                          <>
                          {/* Row 1: 1m, 3m, 6m, 12m predictions (4 cols) */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Prediksi 1 Bulan</div>
                              <div className={`text-lg font-bold ${proj.prediction_1m >= threshold ? 'text-red-600' : proj.prediction_1m >= 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {proj.prediction_1m.toFixed(1)}%
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Prediksi 3 Bulan</div>
                              <div className={`text-lg font-bold ${stat3mLevel >= threshold ? 'text-red-600' : stat3mLevel >= 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {stat3mLevel.toFixed(1)}%
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Prediksi 6 Bulan</div>
                              <div className={`text-lg font-bold ${stat6mLevel >= threshold ? 'text-red-600' : stat6mLevel >= 90 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {stat6mLevel >= threshold ? 'LEWAT BATAS!' : `${stat6mLevel.toFixed(1)}%`}
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Prediksi 12 Bulan</div>
                              <div className={`text-lg font-bold ${proj.prediction_12m >= threshold ? 'text-red-600' : proj.prediction_12m >= 90 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {proj.prediction_12m >= threshold ? 'LEWAT BATAS!' : `${proj.prediction_12m.toFixed(1)}%`}
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Days, Date, Confidence, Data Quality */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">{daysLabel}</div>
                              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                                {(daysToLimit || 0) > 0 ? `${daysToLimit} hari` : 'Sudah Lewati'}
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">{dateLabel}</div>
                              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                                {thresholdDateValue
                                  ? new Date(thresholdDateValue).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : 'Sudah Lewati'
                                }
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Confidence</div>
                              <div className={`text-lg font-bold ${
                                proj.confidence === 'high' ? 'text-green-600' :
                                proj.confidence === 'medium' ? 'text-yellow-600' :
                                proj.confidence === 'low' ? 'text-orange-600' : 'text-red-600'
                              }`}>
                                {proj.confidence === 'high' ? '🟢 Tinggi' :
                                 proj.confidence === 'medium' ? '🟡 Sedang' :
                                 proj.confidence === 'low' ? '🟠 Rendah' : '🔴 Sangat rendah'}
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                              <div className="text-xs text-gray-500 dark:text-gray-400">Data Points</div>
                              <div className="text-lg font-bold text-gray-700 dark:text-gray-400">{proj.data_points}</div>
                            </div>
                          </div>

                          {/* Data Quality Warning Banner */}
                          {proj.data_quality_warning && (
                            <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 p-3 rounded-lg">
                              <span className="text-sm text-gray-900 dark:text-gray-300">⚠️ Proyeksi berdasarkan data terbatas — akurasi mungkin lebih rendah</span>
                            </div>
                          )}
                          </>
                          )}

                          {/* Stable / Decreasing Status Message */}
                          {isStable && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4 text-center">
                              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                                ➡️ <strong>Tren Stabil / Menurun</strong> — penggunaan tidak meningkat signifikan. Saat level ini, resource diperkirakan tidak akan melewati batas.
                              </p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                Slope regresi ≤ 0.000 — tidak ada proyeksi tanggal threshold.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                      })()}

                      {/* Recommendation + Actions */}
                      <div className={`rounded-lg ${
                        proj.urgency === 'critical' ? 'bg-white dark:bg-slate-800 border-2 border-red-300 dark:border-red-700' :
                        proj.urgency === 'warning' ? 'bg-white dark:bg-slate-800 border-2 border-yellow-300 dark:border-yellow-700' :
                        'bg-white dark:bg-slate-800 border-2 border-green-300 dark:border-green-700'
                      }`}>
                        {/* Status + Recommendation Header */}
                        <div className={`px-4 py-3 rounded-t-lg ${
                          proj.urgency === 'critical' ? 'bg-red-50 dark:bg-red-900/40 border-b border-red-200 dark:border-red-700' :
                          proj.urgency === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/40 border-b border-yellow-200 dark:border-yellow-700' :
                          'bg-emerald-50 dark:bg-emerald-900/40 border-b border-emerald-200 dark:border-emerald-700'
                        }`}>
                          <p className={`text-sm font-bold ${
                            proj.urgency === 'critical' ? 'text-red-700 dark:text-red-300' :
                            proj.urgency === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                            'text-emerald-700 dark:text-emerald-300'
                          }`}>💡 Rekomendasi:</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1">{proj.recommendation}</p>
                        </div>

                        {/* Action Items List */}
                        {proj.actions && proj.actions.length > 0 && (
                          <div className="px-4 py-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">📋 Langkah yang Direkomendasikan:</p>
                            <ul className="space-y-2">
                              {proj.actions.map((action: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 bg-gray-50 dark:bg-slate-700 rounded-lg px-3 py-2">
                                  <span className="text-base mt-0.5 flex-shrink-0">{
                                    proj.urgency === 'critical' ? '🚨' :
                                    proj.urgency === 'warning' ? '⚠️' : '✅'
                                  } {i + 1}.</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">{action}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Data Range */}
                      {proj.data_range && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                          📊 Berdasarkan data dari {new Date(proj.data_range.first_date).toLocaleDateString('id-ID')} sampai {new Date(proj.data_range.last_date).toLocaleDateString('id-ID')} ({proj.data_range.total_days} hari)
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Info Box */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-700">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-3">📖 Cara Membaca Proyeksi</h4>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <li>🔲 <strong>CPU Peak:</strong> Proyeksi tren peak CPU menuju threshold 90%</li>
                      <li>🧠 <strong>RAM Peak:</strong> Proyeksi tren peak RAM menuju threshold 90%</li>
                      <li>💾 <strong>Disk Partisi:</strong> Proyeksi penggunaan disk menuju kapasitas penuh (100%)</li>
                      <li>📈 <strong>Tren Naik:</strong> Penggunaan meningkat dari waktu ke waktu</li>
                      <li>📉 <strong>Tren Turun:</strong> Penggunaan menurun (mungkin ada pembersihan)</li>
                      <li>➡️ <strong>Tren Stabil:</strong> Penggunaan tidak berubah signifikan</li>
                      <li>⚠️ <strong>Waspada:</strong> Akan mencapai threshold dalam waktu dekat (&lt;90 hari)</li>
                      <li>🚨 <strong>Kritis:</strong> Akan mencapai threshold dalam waktu singkat (&lt;30 hari)</li>
                    </ul>
                    <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                      💡 <strong>Catatan:</strong> Proyeksi menggunakan Linear Regression berdasarkan data historis. Akurasi tergantung pada konsistensi pola penggunaan.
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'info' ? (
            /* Info Tab */
            <>
              {interfaces.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">ℹ️</div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">Belum ada data informasi server</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Lakukan scan data SAR terlebih dahulu</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Server Info Card */}
                  <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
                    <h3 className="text-xl font-bold mb-4">🖥️ Informasi Server</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm opacity-90">Hostname</div>
                        <div className="text-lg font-bold">{serverInfo?.hostname || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">IP Address</div>
                        <div className="text-lg font-bold font-mono">{serverInfo?.ip_address || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">OS / Source</div>
                        <div className="text-lg font-bold">{serverInfo?.os || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Last Updated</div>
                        <div className="text-lg font-bold">
                          {infoDate ? new Date(infoDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Tanggal SAR</div>
                        <div className="text-lg font-bold">{serverInfo?.server_date || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Public IP</div>
                        <div className="text-lg font-bold font-mono">{serverInfo?.public_ip || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">CPU</div>
                        <div className="text-lg font-bold">{serverInfo?.cpu || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">RAM Total</div>
                        <div className="text-lg font-bold">{serverInfo?.ram || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">System</div>
                        <div className="text-lg font-bold">{serverInfo?.system || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Serial Number</div>
                        <div className="text-lg font-bold font-mono">{serverInfo?.serial || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Hypervisor</div>
                        <div className="text-lg font-bold">{serverInfo?.hypervisor || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Uptime (saat ini)</div>
                        <div className="text-lg font-bold">{serverInfo?.uptime || 'N/A'}</div>
                      </div>
                      <div>
                         <div className="text-sm opacity-90">SLA Bulan Ini</div>
                        <div className="text-lg font-bold">
                          {sla != null && sla.coverage_pct != null ? `${sla.coverage_pct}%` : '-'}
                          {sla != null && sla.days_of_data != null && sla.coverage_pct != null && (
                            <span className="text-sm font-normal opacity-90 ml-1">({sla.days_of_data}/{sla.days_monitored ?? sla.days_in_month} hari)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SLA Bulan ke Bulan */}
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700 border-b border-gray-200 dark:border-gray-600">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">📅 SLA Bulan ke Bulan</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Coverage = hari data / hari dipantau (sejak monitoring aktif) · Target ≥99% · Hari tanpa data ≠ down, ditandai untuk investigasi · Uptime server hanya tersedia sejak script SAR baru (10-08-2026); sebelumnya N/A</p>
                    </div>
                    {serverSLARows.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">Belum ada data SLA</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 dark:bg-slate-800">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Bulan</th>
                              <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300">Hari Dipantau</th>
                              <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300">Hari Data</th>
                              <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300">Tanpa Data</th>
                              <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300">SLA %</th>
                              <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300">Status</th>
                              <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {serverSLARows.map((row, idx) => {
                              const hasSla = row.coverage_pct != null;
                              const slaClass = !hasSla
                                ? 'text-gray-400 dark:text-gray-500'
                                : row.coverage_pct >= 99
                                ? 'text-green-600 dark:text-green-400'
                                : row.coverage_pct >= 95
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400';
                              return (
                                <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{monthFull(row.year_month)}{isRunningMonth(row.year_month) ? ' (berjalan)' : ''}</td>
                                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{hasSla ? (row.days_monitored ?? row.days_in_month) : '—'}</td>
                                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{hasSla ? row.days_of_data : '—'}</td>
                                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{hasSla ? (row.days_no_data ?? row.days_down) : '—'}</td>
                                  <td className={`px-4 py-3 text-center font-bold ${slaClass}`}>{hasSla ? `${row.coverage_pct}%` : '—'}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(mapSlaStatus(row.status))}`}>
                                      {getStatusBadge(mapSlaStatus(row.status))}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300">{slaVerdict(row.status)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">{SLA_NOTE}</div>
                  </div>

                  {/* Network Interfaces Table */}
                  <div className="bg-white dark:bg-slate-700 rounded-lg shadow overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700 border-b border-gray-200 dark:border-gray-600">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">🌐 Network Interfaces</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Data terbaru: {infoDate ? new Date(infoDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Interface</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">IP Address</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Speed</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">RX (Received)</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">TX (Transmitted)</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Packet Drop</th>
                            <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-300">Internet</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interfaces.map((iface, idx) => (
                            <tr key={idx} className={`border-t border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">🔌</span>
                                  <span className="font-mono font-medium text-gray-900 dark:text-white">{iface.interface_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{iface.ip_address || '-'}</span>
                                {iface.mac_address && iface.mac_address !== '-' && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{iface.mac_address}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">
                                {iface.speed}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-blue-600 dark:text-blue-400">
                                {iface.total_rx}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-purple-600 dark:text-purple-400">
                                {iface.total_tx}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  iface.total_packet_drop > 1000 
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' 
                                    : iface.total_packet_drop > 100
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                }`}>
                                  {iface.total_packet_drop}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  iface.internet_status === 'TERHUBUNG'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                }`}>
                                  {iface.internet_status === 'TERHUBUNG' ? '✅ Terhubung' : '❌ Tidak Terhubung'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
