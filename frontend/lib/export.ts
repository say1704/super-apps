import { monthFull, isRunningMonth, slaVerdict, SLA_NOTE } from './sla-status';

/**
 * Export data to CSV file
 */
export function exportToCSV(data: any[], filename: string, columns?: { key: string; label: string }[]) {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  const labels = columns ? columns.map(c => c.label) : keys;

  const csvRows = [
    labels.join(','),
    ...data.map(row => 
      keys.map(key => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export table to Excel (XLSX format)
 */
export async function exportToExcel(data: any[], filename: string, sheetName = 'Data') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const keys = Object.keys(data[0]);
  const rows = data.map(row => keys.map(k => row[k]));
  worksheet.addRow(keys);
  worksheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data to PDF using jsPDF + autoTable
 */
export async function exportToPDF(data: any[], filename: string, title?: string, columns?: { key: string; label: string }[]) {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  const labels = columns ? columns.map(c => c.label) : keys;

  const tableData = data.map(row => keys.map(key => {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }));

  if (title) {
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
  }

  autoTable(doc, {
    head: [labels],
    body: tableData,
    startY: title ? 26 : 10,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { top: title ? 26 : 10, left: 10, right: 10 },
  });

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export capacity report PDF with professional layout.
 * @param data API response with { summary, servers } structure
 * @param reportDate formatted report date string
 */
export async function exportCapacityReportPDF(
  data: { records: any[]; total: number; from_date: string; to_date: string },
  fromDate: string,
  toDate?: string,
) {
  if (!data.records || data.records.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { records } = data;

  const secDiskLabel = records.find(r => r.disk_data_label)?.disk_data_label || null;

  // Format date range for display
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  // Calculate summary from records
  const uniqueServers = new Set(records.map(r => r.hostname)).size;
  const okCount = records.filter(r => r.status === 'ok').length;
  const warningCount = records.filter(r => r.status === 'warning').length;
  const criticalCount = records.filter(r => r.status === 'critical').length;

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN KAPASITAS SERVER', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — Server Capacity Monitoring (SAR)', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Server: ${uniqueServers}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(34, 139, 34);
  doc.text(`OK: ${okCount}`, margin + 50, y);
  doc.setTextColor(202, 138, 4);
  doc.text(`Warning: ${warningCount}`, margin + 85, y);
  doc.setTextColor(220, 38, 38);
  doc.text(`Critical: ${criticalCount}`, margin + 130, y);
  doc.setTextColor(100);
  doc.text(`Records: ${records.length}`, margin + 175, y);
  y += 8;

  // ── TABLE ──
  const hasSecDisk = secDiskLabel != null;
  const headers = ['No.', 'Hostname', 'Date', 'Status', 'CPU Peak', 'CPU Time', 'RAM Peak', 'RAM Time', 'Disk /'];
  if (hasSecDisk) headers.push(`Disk ${secDiskLabel}`);
  headers.push('Network RX', 'Network TX', 'Packet Drop', 'Internet');

  const ifaceRowIndices: number[] = [];
  const body: (string | number)[][] = [];
  records.forEach((r: any, i: number) => {
    const row: (string | number)[] = [
      i + 1,
      r.hostname,
      r.tanggal || '-',
      r.status.toUpperCase(),
      r.cpu_peak_max != null ? `${r.cpu_peak_max.toFixed(2)}%` : (r.cpu_peak != null ? `${r.cpu_peak.toFixed(2)}%` : '-'),
      r.cpu_peak_time || '-',
      r.ram_peak != null ? `${r.ram_peak.toFixed(2)}%` : '-',
      r.ram_peak_time || '-',
      r.disk_root_pct != null ? `${r.disk_root_pct.toFixed(2)}%` : '-',
    ];
    if (hasSecDisk) row.push(r.disk_data_pct != null ? `${r.disk_data_pct.toFixed(2)}%` : '-');
    row.push(
      r.total_rx || '-',
      r.total_tx || '-',
      r.total_packet_drop ?? '-',
      r.internet_status || '-'
    );
    body.push(row);

    const interfaces = Array.isArray(r.network_interfaces) ? r.network_interfaces : [];
    if (interfaces.length > 1) {
      interfaces.forEach((n: any) => {
        const sub: (string | number)[] = [
          '',
          `    ${n.interface_name || '-'}`,
          n.ip_address || '-',
          n.speed || '-',
          '', '', '', '',
          '',
        ];
        if (hasSecDisk) sub.push('');
        sub.push(
          n.total_rx || '-',
          n.total_tx || '-',
          n.total_packet_drop ?? '-',
          n.internet_status || '-'
        );
        ifaceRowIndices.push(body.length);
        body.push(sub);
      });
    }
  });

  const pctCols = hasSecDisk ? [4, 6, 8, 9] : [4, 6, 8];
  const packetDropCol = hasSecDisk ? 12 : 11;
  const internetCol = hasSecDisk ? 13 : 12;
  // status col index: 3 (always)

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.5, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 35 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 16 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 16 },
      8: { halign: 'center', cellWidth: 14 },
      9: { halign: 'center', cellWidth: 14 },
      10: { halign: 'center', cellWidth: 18 },
      11: { halign: 'center', cellWidth: 18 },
      12: { halign: 'center', cellWidth: 18 },
      13: { halign: 'center', cellWidth: 22 },
    },
    didParseCell: function (celldata) {
      if (celldata.section === 'body') {
        if (ifaceRowIndices.includes(celldata.row.index)) {
          (celldata.cell as any).styles.fontSize = 5.5;
          (celldata.cell as any).styles.fontStyle = 'normal';
          (celldata.cell as any).styles.textColor = 100;
          (celldata.cell as any).styles.fillColor = [240, 244, 250];
        }
        if (celldata.column.index === 3) {
          const val = String(celldata.cell.raw);
          if (val === 'CRITICAL') {
            (celldata.cell as any).styles.textColor = [220, 38, 38];
            (celldata.cell as any).styles.fillColor = [254, 226, 226];
          } else if (val === 'WARNING') {
            (celldata.cell as any).styles.textColor = [202, 138, 4];
            (celldata.cell as any).styles.fillColor = [254, 249, 195];
          } else if (val === 'OK') {
            (celldata.cell as any).styles.textColor = [34, 139, 34];
            (celldata.cell as any).styles.fillColor = [209, 250, 209];
          }
        }
        if (pctCols.includes(celldata.column.index)) {
          const val = String(celldata.cell.raw).replace(/%/g, '');
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 90) {
            (celldata.cell as any).styles.textColor = [220, 38, 38];
            (celldata.cell as any).styles.fontStyle = 'bold';
          }
        }
        if (celldata.column.index === packetDropCol) {
          const val = parseInt(String(celldata.cell.raw));
          if (!isNaN(val)) {
            if (val > 100) {
              (celldata.cell as any).styles.textColor = [220, 38, 38];
              (celldata.cell as any).styles.fontStyle = 'bold';
            } else if (val > 0) {
              (celldata.cell as any).styles.textColor = [202, 138, 4];
            }
          }
        }
        if (celldata.column.index === internetCol) {
          const val = String(celldata.cell.raw);
          if (val === 'TERHUBUNG') {
            (celldata.cell as any).styles.textColor = [34, 139, 34];
            (celldata.cell as any).styles.fillColor = [209, 250, 209];
          } else if (val === 'TIDAK TERHUBUNG') {
            (celldata.cell as any).styles.textColor = [220, 38, 38];
            (celldata.cell as any).styles.fillColor = [254, 226, 226];
          }
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Server Capacity Monitoring (SAR)', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`capacity_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export SLA analysis report PDF (per server per month coverage).
 */
export async function exportSLAPDF(
  data: { rows: any[]; total: number; from_date: string; to_date: string; summary: { servers: number; avg_sla: number } },
  fromDate: string,
  toDate?: string,
) {
  if (!data.rows || data.rows.length === 0) {
    console.warn('No SLA data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { rows, summary } = data;
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN ANALISA SLA', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — SLA Monitoring (SAR)', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Server: ${summary?.servers ?? 0}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(34, 139, 34);
  doc.text(`Rata-rata SLA: ${(summary?.avg_sla ?? 0).toFixed(2)}%`, margin + 50, y);
  doc.setTextColor(100);
  doc.text(`Records: ${rows.length}`, margin + 130, y);

  // ── KETERANGAN ──
  y += 8;
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text('Keterangan: ' + SLA_NOTE + ' Target SLA >= 99% OK, 95-98.9% Warning, < 95% Kritikal. Uptime server hanya tersedia sejak script SAR baru (10-08-2026); sebelumnya N/A.', margin, y);
  y += 6;

  // ── TABLE ──
  const headers = ['No.', 'Hostname', 'Bulan', 'Hari Dipantau', 'Hari Data', 'Tanpa Data', 'SLA %', 'Uptime (saat ini)', 'Tgl Uptime', 'Status', 'Keterangan'];
  const body = rows.map((r: any, i: number) => {
    const hasSla = r.coverage_pct != null;
    return [
      i + 1,
      r.hostname,
      `${monthFull(r.year_month)}${isRunningMonth(r.year_month) ? ' (berjalan)' : ''}`,
      hasSla ? (r.days_monitored ?? r.days_in_month) : '—',
      hasSla ? r.days_of_data : '—',
      hasSla ? (r.days_no_data ?? r.days_down) : '—',
      hasSla ? `${r.coverage_pct.toFixed(2)}%` : '—',
      r.uptime || 'N/A',
      r.uptime_date || '-',
      r.status || 'OK',
      slaVerdict(r.status),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 45 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
      7: { halign: 'left', cellWidth: 55 },
      8: { halign: 'center', cellWidth: 30 },
      9: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      10: { halign: 'left' },
    },
    didParseCell: function (celldata) {
      if (celldata.section !== 'body') return;
      if (celldata.column.index === 6) {
        const val = parseFloat(String(celldata.cell.raw));
        if (!isNaN(val)) {
          if (val < 95) {
            (celldata.cell as any).styles.textColor = [220, 38, 38];
            (celldata.cell as any).styles.fillColor = [254, 226, 226];
          } else if (val < 99) {
            (celldata.cell as any).styles.textColor = [202, 138, 4];
            (celldata.cell as any).styles.fillColor = [254, 249, 195];
          } else {
            (celldata.cell as any).styles.textColor = [34, 139, 34];
            (celldata.cell as any).styles.fillColor = [209, 250, 209];
          }
        }
      }
      if (celldata.column.index === 9) {
        const val = String(celldata.cell.raw);
        if (val === 'KRITIS') {
          (celldata.cell as any).styles.textColor = [220, 38, 38];
          (celldata.cell as any).styles.fillColor = [254, 226, 226];
        } else if (val === 'WARNING') {
          (celldata.cell as any).styles.textColor = [202, 138, 4];
          (celldata.cell as any).styles.fillColor = [254, 249, 195];
        } else {
          (celldata.cell as any).styles.textColor = [34, 139, 34];
          (celldata.cell as any).styles.fillColor = [209, 250, 209];
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Server Capacity Monitoring (SAR)', margin, pageH - 8);
    doc.setDrawColor(200);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
  }

  doc.save(`sla_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export IRMC check report PDF with professional layout.
 */
export async function exportIRMCReportPDF(
  data: { summary: { total: number; pass: number; warning: number; fail: number; pending: number }; checks: any[] },
  fromDate: string,
  toDate?: string,
) {
  if (!data.checks || data.checks.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { summary, checks } = data;

  // Format date range for display
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN IRMC CHECK', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — iRMC Health Check', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`Total: ${summary.total}`, margin, y);
  doc.setTextColor(34, 139, 34);
  doc.text(`Pass: ${summary.pass}`, margin + 50, y);
  doc.setTextColor(202, 138, 4);
  doc.text(`Warning: ${summary.warning}`, margin + 95, y);
  doc.setTextColor(220, 38, 38);
  doc.text(`Fail: ${summary.fail}`, margin + 145, y);
  doc.setTextColor(100);
  doc.text(`Pending: ${summary.pending}`, margin + 185, y);
  y += 8;

  // ── TABLE ──
  const headers = ['No.', 'Server', 'Date', 'Status', 'Notes'];

  const body = checks.map((c: any, i: number) => [
    i + 1,
    c.server_name,
    c.check_date,
    c.status,
    c.notes || '-',
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 3) {
        const val = String(data.cell.raw).toLowerCase();
        if (val === 'pass') {
          (data.cell as any).styles.fillColor = [209, 250, 209];
          (data.cell as any).styles.textColor = [34, 139, 34];
        } else if (val === 'warning') {
          (data.cell as any).styles.fillColor = [254, 249, 195];
          (data.cell as any).styles.textColor = [202, 138, 4];
        } else if (val === 'fail') {
          (data.cell as any).styles.fillColor = [254, 226, 226];
          (data.cell as any).styles.textColor = [220, 38, 38];
        } else if (val === 'pending') {
          (data.cell as any).styles.fillColor = [240, 240, 240];
          (data.cell as any).styles.textColor = [100, 100, 100];
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`irmc_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export SSH login report PDF with professional layout.
 */
export async function exportSSHReportPDF(
  data: {
    records: any[];
    total: number;
    from_date: string;
    to_date: string;
  },
  fromDate: string,
  toDate?: string,
) {
  if (!data.records || data.records.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { records } = data;

  // Format date range for display
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  // Calculate summary from records
  const uniqueServers = new Set(records.map(r => r.hostname)).size;
  const totalLogins = records.reduce((s: number, r: any) => s + r.total_logins, 0);
  const totalSuccess = records.reduce((s: number, r: any) => s + r.success_count, 0);
  const totalFailed = records.reduce((s: number, r: any) => s + r.failed_count, 0);

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN LOGIN SSH', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — SSH REPORT', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`Total Server: ${uniqueServers}`, margin, y);
  doc.setTextColor(80);
  doc.text(`Total Logins: ${totalLogins}`, margin + 50, y);
  doc.setTextColor(34, 139, 34);
  doc.text(`Success: ${totalSuccess}`, margin + 100, y);
  doc.setTextColor(220, 38, 38);
  doc.text(`Failed: ${totalFailed}`, margin + 145, y);
  doc.setTextColor(100);
  doc.text(`Records: ${records.length}`, margin + 185, y);
  y += 8;

  // ── TABLE (per-date) ──
  const headers = ['No.', 'Hostname', 'Date', 'Total Logins', 'Success', 'Failed'];

  const body = records.map((r: any, i: number) => [
    i + 1,
    r.hostname,
    r.date,
    r.total_logins,
    r.success_count,
    r.failed_count,
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    didParseCell: function (celldata) {
      if (celldata.section === 'body') {
        if (celldata.column.index === 4) {
          const val = parseInt(String(celldata.cell.raw));
          if (!isNaN(val) && val > 0) {
            (celldata.cell as any).styles.fillColor = [209, 250, 209];
            (celldata.cell as any).styles.textColor = [34, 139, 34];
            (celldata.cell as any).styles.fontStyle = 'bold';
          }
        }
        if (celldata.column.index === 5) {
          const val = parseInt(String(celldata.cell.raw));
          if (!isNaN(val) && val > 0) {
            (celldata.cell as any).styles.fillColor = [254, 226, 226];
            (celldata.cell as any).styles.textColor = [220, 38, 38];
            (celldata.cell as any).styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`ssh_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export Audit File report PDF — format seragam dengan SSH/Capacity/iRMC.
 */
export async function exportAuditPDF(
  data: {
    records: any[];
    total: number;
    total_servers: number;
    total_events: number;
    from_date: string;
    to_date: string;
  },
  fromDate: string,
  toDate?: string,
) {
  if (!data.records || data.records.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { records, total_servers, total_events } = data;
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  const uniqueServers = new Set(records.map((r: any) => r.hostname)).size;
  const totalActivities = records.reduce((s: number, r: any) => s + (r.activities || 0), 0);
  const totalNoChange = records.reduce((s: number, r: any) => s + (r.no_change_days || 0), 0);
  const totalFiles = records.reduce((s: number, r: any) => s + (r.files_affected || 0), 0);

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN AUDIT FILE', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — AUDIT FILE', pageW - margin, 26, { align: 'right' });

  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`Total Server: ${uniqueServers}`, margin, y);
  doc.setTextColor(80);
  doc.text(`Total Event: ${total_events}`, margin + 50, y);
  doc.setTextColor(34, 139, 34);
  doc.text(`Activities: ${totalActivities}`, margin + 100, y);
  doc.setTextColor(100);
  doc.text(`No Change: ${totalNoChange}`, margin + 150, y);
  doc.setTextColor(59, 130, 246);
  doc.text(`Files: ${totalFiles}`, margin + 205, y);
  y += 8;

  const headers = ['No.', 'Hostname', 'Date', 'Total Events', 'Activities', 'No Change', 'Files Affected'];
  const body = records.map((r: any, i: number) => [
    i + 1, r.hostname, r.date, r.total_events, r.activities, r.no_change_days, r.files_affected,
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
    },
    didParseCell: function (celldata) {
      if (celldata.section === 'body') {
        if (celldata.column.index === 4) {
          const val = parseInt(String(celldata.cell.raw));
          if (!isNaN(val) && val > 0) {
            (celldata.cell as any).styles.fillColor = [209, 250, 209];
            (celldata.cell as any).styles.textColor = [34, 139, 34];
            (celldata.cell as any).styles.fontStyle = 'bold';
          }
        }
        if (celldata.column.index === 5) {
          const val = parseInt(String(celldata.cell.raw));
          if (!isNaN(val) && val > 0) {
            (celldata.cell as any).styles.fillColor = [254, 249, 195];
            (celldata.cell as any).styles.textColor = [202, 138, 4];
          }
        }
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`audit_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export Backup Check report PDF — format seragam dengan Capacity/SSH/iRMC.
 */
export async function exportBackupCheckReportPDF(
  data: {
    summary: { total_servers: number; total_files: string; total_size: string };
    records: any[];
  },
  fromDate: string,
  toDate?: string,
) {
  if (!data.records || data.records.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { summary, records } = data;

  // Format date range for display
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN BACKUP CHECK', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Semua Server | Periode: ${dateRange}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — Backup Monitoring', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`Total Server: ${summary.total_servers}`, margin, y);
  doc.setTextColor(100);
  doc.text(`Total Backup: ${summary.total_files} files`, margin + 55, y);
  doc.text(`Total Size: ${summary.total_size}`, margin + 120, y);
  y += 8;

  // ── TABLE ──
  const headers = ['No.', 'Server', 'Last Backup', 'Files', 'Size', 'Status'];

  const body = records.map((r: any, i: number) => [
    i + 1,
    r.server || r.Server,
    r.date || r.Last_Backup || '-',
    r.files_formatted || r.Files || '-',
    r.size_formatted || r.Size || '-',
    r.status || r.Status,
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 5) {
        const val = String(data.cell.raw);
        if (val === 'OK') {
          (data.cell as any).styles.fillColor = [209, 250, 209];
          (data.cell as any).styles.textColor = [34, 139, 34];
        } else if (val === 'Warning') {
          (data.cell as any).styles.fillColor = [254, 249, 195];
          (data.cell as any).styles.textColor = [202, 138, 4];
        } else if (val === 'Critical') {
          (data.cell as any).styles.fillColor = [254, 226, 226];
          (data.cell as any).styles.textColor = [220, 38, 38];
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`backup_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export per-server backup history PDF — format seragam.
 */
export async function exportBackupCheckHistoryPDF(
  data: {
    serverName: string;
    periodDays: number;
    statistics: { avg_files: number; avg_size_gb: number; total_records: number; max_files: number; min_files: number; max_size_gb: number; min_size_gb: number };
    history: any[];
  },
) {
  if (!data.history || data.history.length === 0) {
    console.warn('No history data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const { serverName, periodDays, statistics, history } = data;

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN HISTORY BACKUP', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${serverName} | ${periodDays} hari terakhir`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — Backup Monitoring', pageW - margin, 26, { align: 'right' });

  // ── SUMMARY CARDS ──
  let y = 40;
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text('Ringkasan', margin, y);
  y += 2;

  const cardW = (pageW - margin * 2 - 12) / 3;
  const cardH = 22;

  function makeCard(label: string, value: string, x: number, yy: number) {
    doc.setFillColor(245, 245, 250);
    doc.roundedRect(x, yy, cardW, cardH, 2, 2, 'F');
    doc.setDrawColor(200);
    doc.roundedRect(x, yy, cardW, cardH, 2, 2, 'S');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + 4, yy + 9);
    doc.setFontSize(14);
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 4, yy + 18);
    doc.setFont('helvetica', 'normal');
  }

  makeCard('Rata-rata Files', `${statistics.avg_files.toFixed(0)} (Min: ${statistics.min_files}, Max: ${statistics.max_files})`, margin, y + 4);
  makeCard('Rata-rata Size', `${statistics.avg_size_gb.toFixed(2)} GB (Min: ${statistics.min_size_gb.toFixed(2)}, Max: ${statistics.max_size_gb.toFixed(2)})`, margin + cardW + 6, y + 4);
  makeCard('Total Records', `${statistics.total_records}`, margin + (cardW + 6) * 2, y + 4);

  y += cardH + 8;

  // ── INFO BAR ──
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text(`${history.length} records · ${periodDays} hari terakhir`, margin, y + 2);
  y += 8;

  // ── TABLE ──
  const headers = ['No.', 'Date', 'Files', 'Size', 'Status'];

  const body = history.map((h: any, i: number) => [
    i + 1,
    h.backup_date || '-',
    (h.jumlah_files || 0).toLocaleString(),
    h.total_size_formatted || '-',
    h.status || '-',
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 4) {
        const val = String(data.cell.raw).toLowerCase();
        if (val.includes('ok')) {
          (data.cell as any).styles.fillColor = [209, 250, 209];
          (data.cell as any).styles.textColor = [34, 139, 34];
        } else if (val.includes('warning')) {
          (data.cell as any).styles.fillColor = [254, 249, 195];
          (data.cell as any).styles.textColor = [202, 138, 4];
        } else if (val.includes('critical')) {
          (data.cell as any).styles.fillColor = [254, 226, 226];
          (data.cell as any).styles.textColor = [220, 38, 38];
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text(`Dokumen ini dihasilkan secara otomatis — Backup History ${serverName}`, margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`backup_history_${serverName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}


/**
 * Export a single section PDF with standardized format (navy header, info bar, theme grid, footer).
 * Used by per-tab ExportActions in Backup Analytics and any module needing a standardized single-section PDF.
 */
export async function exportSectionPDF(options: {
  title: string;
  subtitle?: string;
  summaryItems?: Array<{ label: string; value: string | number; color?: string }>;
  columns: { key: string; label: string }[];
  data: Record<string, unknown>[];
  filename: string;
  statusConfig?: { colIndex: number; valueColors: Record<string, [number, number, number]>; valueBgs: Record<string, [number, number, number]> };
  orientation?: 'landscape' | 'portrait';
}) {
  if (!options.data || options.data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: options.orientation || 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy: [number, number, number] = [36, 72, 141];

  const colorMap: Record<string, [number, number, number]> = {
    navy: [36, 72, 141],
    green: [34, 139, 34],
    yellow: [202, 138, 4],
    red: [220, 38, 38],
    blue: [59, 130, 246],
    gray: [100, 100, 100],
  };

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title, margin, 16);
  if (options.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(options.subtitle, margin, 26);
  }

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — Backup Analytics', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  if (options.summaryItems && options.summaryItems.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let xOffset = margin;
    const gap = 50;
    for (const item of options.summaryItems) {
      const c = item.color ? colorMap[item.color] || navy : navy;
      doc.setTextColor(...c);
      doc.text(`${item.label}: ${item.value}`, xOffset, y);
      xOffset += gap;
    }
    y += 8;
  }

  // ── TABLE ──
  const keys = options.columns.map(c => c.key);
  const labels = options.columns.map(c => c.label);
  const body = options.data.map((row, i) => {
    const vals = keys.map(k => {
      const val = row[k];
      return val === null || val === undefined ? '' : String(val);
    });
    return [i + 1, ...vals];
  });

  const sc = options.statusConfig;
  autoTable(doc, {
    startY: y,
    head: [labels],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && sc && sc.colIndex != null && data.column.index === sc.colIndex + 1) {
        const val = String(data.cell.raw);
        const textColor = sc.valueColors[val];
        const bgColor = sc.valueBgs[val];
        if (textColor) {
          (data.cell as any).styles.textColor = textColor;
          (data.cell as any).styles.fontStyle = 'bold';
        }
        if (bgColor) {
          (data.cell as any).styles.fillColor = bgColor;
        }
      }
    },
  });

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`${options.filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}


/**
 * Export comprehensive Analytics Backup report — multi-section PDF with standardized format.
 * Includes summary card, all servers, anomalies, heatmap, and text placeholders for other tabs.
 * Uses only data available at page level (no child-component restructuring needed).
 */
export async function exportBackupAnalyticsReportPDF(
  data: {
    summary?: {
      total_gb: number;
      total_files: number;
      server_count: number;
      backed_up_today: number;
      missing_count: number;
      avg_daily_growth_pct: number;
      anomaly_count: number;
    };
    servers?: Array<{
      ip: string;
      last_backup: string | null;
      days_ago: number;
      size_kb: number;
      size_mb: number;
      size_gb: number;
      files: number;
      status: string;
      growth_pct: number;
    }>;
    anomalies?: Array<{
      ip: string;
      date: string;
      prev_size_gb: number;
      curr_size_gb: number;
      change_pct: number;
      type: string;
    }>;
    heatmapInfo?: { servers: number; dates: number };
    missingServers?: Array<{
      ip: string;
      last_backup: string | null;
      days_ago: number;
      size_gb: number;
      files: number;
      status: string;
      growth_pct: number;
    }>;
    topServers?: Array<{
      ip: string;
      size_gb: number;
      files: number;
      last_backup: string | null;
      status: string;
      growth_pct: number;
    }>;
    growthServers?: Array<{
      ip: string;
      current_gb: number;
      growth_pct: number;
      files: number;
      status: string;
    }>;
    trendInfo?: { total_days: number };
  },
  fromDate: string,
  toDate?: string,
) {
  const { summary, servers, anomalies, heatmapInfo, missingServers, topServers, growthServers } = data;

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy: [number, number, number] = [36, 72, 141];

  // Format date range for display
  const dateRange = toDate && toDate !== fromDate ? `${fromDate} to ${toDate}` : fromDate;
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── HELPER: add section table ──
  function addTable(
    title: string,
    subtitle: string | undefined,
    summaryItems: Array<{ label: string; value: string | number; color?: string }> | undefined,
    headers: string[],
    body: any[][],
    statusColIndex?: number,
    statusColors?: Record<string, [number, number, number]>,
    statusBgs?: Record<string, [number, number, number]>,
  ) {
    if (body.length === 0) return;

    const needsNewPage = (doc as any).lastAutoTable != null;
    if (needsNewPage) {
      doc.addPage();
    }

    const currentPage = doc.getNumberOfPages();
    doc.setPage(currentPage);

    // Header
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, 16);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(subtitle, margin, 26);
    }
    doc.setFontSize(8);
    doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
    doc.text('Sistem Manajemen TI Terintegrasi — Backup Analytics', pageW - margin, 26, { align: 'right' });

    // Info bar
    let yPos = 44;
    if (summaryItems && summaryItems.length > 0) {
      const colorMap: Record<string, [number, number, number]> = {
        navy: [36, 72, 141], green: [34, 139, 34], yellow: [202, 138, 4],
        red: [220, 38, 38], blue: [59, 130, 246], gray: [100, 100, 100],
      };
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      let xOff = margin;
      for (const item of summaryItems) {
        const c = item.color ? colorMap[item.color] || navy : navy;
        doc.setTextColor(...c);
        const txt = `${item.label}: ${item.value}`;
        doc.text(txt, xOff, yPos);
        xOff += doc.getTextWidth(txt) + 18;
      }
      yPos += 8;
    }

    // Table
    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
      headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
      },
      didParseCell: function (cellData) {
        if (cellData.section === 'body' && statusColIndex != null && cellData.column.index === statusColIndex) {
          const val = String(cellData.cell.raw);
          if (statusColors?.[val]) {
            (cellData.cell as any).styles.textColor = statusColors[val];
            (cellData.cell as any).styles.fontStyle = 'bold';
          }
          if (statusBgs?.[val]) {
            (cellData.cell as any).styles.fillColor = statusBgs[val];
          }
        }
      },
    });
  }

  // ── SECTION: All Servers ──
  if (servers && servers.length > 0) {
    const headers = ['No.', 'IP', 'Last Backup', 'Size GB', 'Files', 'Growth %', 'Status'];
    const body = servers.map((s, i) => [
      i + 1, s.ip, s.last_backup || 'Never',
      s.size_gb.toFixed(3), s.files.toLocaleString(),
      `${s.growth_pct > 0 ? '+' : ''}${s.growth_pct.toFixed(1)}%`, s.status,
    ]);
    addTable(
      'LAPORAN ANALYTICS BACKUP',
      `Ringkasan Semua Server | Periode: ${dateRange}`,
      summary ? [
        { label: 'Total Server', value: summary.server_count, color: 'navy' },
        { label: 'Backup Hari Ini', value: summary.backed_up_today, color: 'green' },
        { label: 'Missing', value: summary.missing_count, color: 'red' },
        { label: 'Growth', value: `${summary.avg_daily_growth_pct.toFixed(1)}%`, color: 'blue' },
        { label: 'Total GB', value: summary.total_gb.toFixed(1), color: 'gray' },
        { label: 'Files', value: summary.total_files.toLocaleString(), color: 'gray' },
      ] : undefined,
      headers, body,
      6,
      { 'OK': [34, 139, 34], 'Warning': [202, 138, 4], 'Critical': [220, 38, 38] },
      { 'OK': [209, 250, 209], 'Warning': [254, 249, 195], 'Critical': [254, 226, 226] },
    );
  }

  // ── SECTION: Missing Servers ──
  if (missingServers && missingServers.length > 0) {
    const headers = ['No.', 'IP', 'Last Backup', 'Days Ago', 'Size GB', 'Files', 'Status'];
    const body = missingServers.map((s, i) => [
      i + 1, s.ip, s.last_backup || 'Never', s.days_ago,
      s.size_gb.toFixed(3), s.files.toLocaleString(), s.status,
    ]);
    addTable(
      'Server Missing Backup', undefined,
      [{ label: 'Total Missing', value: missingServers.length, color: 'red' }],
      headers, body, 6,
      { 'OK': [34, 139, 34], 'Warning': [202, 138, 4], 'Critical': [220, 38, 38] },
      { 'OK': [209, 250, 209], 'Warning': [254, 249, 195], 'Critical': [254, 226, 226] },
    );
  }

  // ── SECTION: Top 10 ──
  if (topServers && topServers.length > 0) {
    const headers = ['No.', 'IP', 'Size GB', 'Files', 'Last Backup', 'Growth %', 'Status'];
    const body = topServers.map((s, i) => [
      i + 1, s.ip, s.size_gb.toFixed(3), s.files.toLocaleString(),
      s.last_backup || 'Never', `${s.growth_pct > 0 ? '+' : ''}${s.growth_pct.toFixed(1)}%`, s.status,
    ]);
    addTable(
      'Top 10 Server (Terbesar)', undefined,
      [{ label: 'Total Server', value: topServers.length, color: 'navy' }],
      headers, body, 6,
      { 'OK': [34, 139, 34], 'Warning': [202, 138, 4], 'Critical': [220, 38, 38] },
      { 'OK': [209, 250, 209], 'Warning': [254, 249, 195], 'Critical': [254, 226, 226] },
    );
  }

  // ── SECTION: Growth ──
  if (growthServers && growthServers.length > 0) {
    const headers = ['No.', 'IP', 'Current GB', 'Growth %', 'Files', 'Status'];
    const body = growthServers.map((s, i) => [
      i + 1, s.ip, s.current_gb.toFixed(3),
      `${s.growth_pct > 0 ? '+' : ''}${s.growth_pct.toFixed(1)}%`,
      s.files.toLocaleString(), s.status,
    ]);
    addTable(
      'Top 10 Pertumbuhan (Growth)', undefined,
      [{ label: 'Total Server', value: growthServers.length, color: 'navy' }],
      headers, body, 5,
      { 'OK': [34, 139, 34], 'Warning': [202, 138, 4], 'Critical': [220, 38, 38] },
      { 'OK': [209, 250, 209], 'Warning': [254, 249, 195], 'Critical': [254, 226, 226] },
    );
  }

  // ── SECTION: Anomalies ──
  if (anomalies && anomalies.length > 0) {
    const headers = ['No.', 'IP', 'Tanggal', 'Sebelum (GB)', 'Sesudah (GB)', 'Perubahan', 'Tipe'];
    const body = anomalies.map((a, i) => [
      i + 1, a.ip, a.date,
      a.prev_size_gb.toFixed(3), a.curr_size_gb.toFixed(3),
      `${a.change_pct.toFixed(1)}%`, a.type === 'drop' ? 'Penurunan' : 'Kenaikan',
    ]);
    addTable(
      'Deteksi Anomali', undefined,
      [
        { label: 'Total Anomali', value: anomalies.length, color: 'red' },
        { label: 'Drop', value: anomalies.filter(a => a.type === 'drop').length, color: 'red' },
        { label: 'Spike', value: anomalies.filter(a => a.type === 'spike').length, color: 'yellow' },
      ],
      headers, body, 6,
      { 'Penurunan': [220, 38, 38], 'Kenaikan': [202, 138, 4] },
      { 'Penurunan': [254, 226, 226], 'Kenaikan': [254, 249, 195] },
    );
  }

  // ── SECTION: Heatmap ──
  if (heatmapInfo && heatmapInfo.servers > 0 && heatmapInfo.dates > 0) {
    const needsNewPage = (doc as any).lastAutoTable != null;
    if (needsNewPage) doc.addPage();
    const pageNum = doc.getNumberOfPages();
    doc.setPage(pageNum);
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Heatmap Backup', margin, 16);
    doc.setFontSize(8);
    doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
    doc.text('Sistem Manajemen TI Terintegrasi — Backup Analytics', pageW - margin, 26, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cakupan: ${heatmapInfo.servers} server × ${heatmapInfo.dates} hari`, margin, 48);
    doc.text('Visualisasi heatmap tersedia di dashboard interaktif.', margin, 58);
  }

  // ── SECTION: Other tabs placeholder ──
  {
    const needsNewPage = (doc as any).lastAutoTable != null;
    if (needsNewPage) doc.addPage();
    const pageNum = doc.getNumberOfPages();
    doc.setPage(pageNum);
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Analisis Lainnya', margin, 16);
    doc.setFontSize(8);
    doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
    doc.text('Sistem Manajemen TI Terintegrasi — Backup Analytics', pageW - margin, 26, { align: 'right' });

    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.setFont('helvetica', 'normal');
    const otherTabs = [
      'Proyeksi Kapasitas — Prediksi kebutuhan storage ke depan',
      'ML Predictions — Forecasting & Time Series analysis',
      'Server Clustering — Pengelompokan pola backup',
      'History Keseluruhan — Riwayat backup per server',
      'Agregasi Backup — Ringkasan backup per periode',
    ];
    let ty = 48;
    for (const tab of otherTabs) {
      doc.text(`• ${tab}`, margin, ty);
      ty += 10;
    }
    doc.text('', margin, ty + 6);
    doc.setTextColor(150);
    doc.setFontSize(9);
    doc.text('Data selengkapnya tersedia di dashboard interaktif dan fitur export per-tab.', margin, ty + 6);
  }

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, doc.internal.pageSize.getHeight() - 8);
    doc.setDrawColor(200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 12, pageW - margin, doc.internal.pageSize.getHeight() - 12);
  }

  doc.save(`analytics_backup_report_${dateRange.replace(/[/ ]/g, '_')}.pdf`);
}


/**
 * Export Audit Trail report PDF — format seragam dengan Capacity/SSH/Audit File.
 * Menampilkan findings (termasuk field Intertek) plus corrective actions per finding.
 */
export async function exportAuditTrailPDF(
  data: { data: any[]; total: number },
  filters?: { source?: string; severity?: string; status?: string },
) {
  const records = data?.data || [];
  if (!records || records.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const navy = [36, 72, 141] as [number, number, number];

  const sevLabel: Record<string, string> = { minor: 'Minor', major: 'Major', critical: 'Critical' };
  const statusLabel: Record<string, string> = { open: 'Open', in_progress: 'In Progress', closed: 'Closed' };
  const srcLabel: Record<string, string> = { internal: 'Internal', external: 'External', surveillance: 'Surveillance' };
  const catLabel: Record<string, string> = {
    conformity: 'Conformity',
    non_conformity: 'Non-Conformity',
    observation: 'Observation',
    ofi: 'OFI',
  };
  const actStatusLabel: Record<string, string> = {
    pending: 'Pending', in_progress: 'In Progress', verified: 'Verified', closed: 'Closed',
  };

  const openCount = records.filter((r: any) => r.status === 'open').length;
  const inProgressCount = records.filter((r: any) => r.status === 'in_progress').length;
  const closedCount = records.filter((r: any) => r.status === 'closed').length;
  const overdueCount = records.filter((r: any) =>
    r.status !== 'closed' && r.due_date && new Date(r.due_date) < new Date()
  ).length;
  const criticalCount = records.filter((r: any) => r.severity === 'critical').length;
  const majorCount = records.filter((r: any) => r.severity === 'major').length;
  const minorCount = records.filter((r: any) => r.severity === 'minor').length;
  const totalActions = records.reduce((s: number, r: any) => s + ((r.corrective_actions || []).length), 0);

  const filterParts: string[] = [];
  if (filters?.source) filterParts.push(`Source: ${srcLabel[filters.source] || filters.source}`);
  if (filters?.severity) filterParts.push(`Severity: ${sevLabel[filters.severity] || filters.severity}`);
  if (filters?.status) filterParts.push(`Status: ${statusLabel[filters.status] || filters.status}`);
  const filterStr = filterParts.length > 0 ? ` | ${filterParts.join(' • ')}` : ' | Semua Data';

  // ── HEADER ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN AUDIT TRAIL', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`ISO 27001:2022 & ISO 9001:2015${filterStr}`, margin, 26);

  doc.setFontSize(9);
  const nowStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 16, { align: 'right' });
  doc.text('Sistem Manajemen TI Terintegrasi — Audit Trail', pageW - margin, 26, { align: 'right' });

  // ── INFO BAR ──
  let y = 44;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`Total Finding: ${records.length}`, margin, y);
  doc.setTextColor(220, 38, 38);
  doc.text(`Open: ${openCount}`, margin + 55, y);
  doc.setTextColor(202, 138, 4);
  doc.text(`In Progress: ${inProgressCount}`, margin + 95, y);
  doc.setTextColor(34, 139, 34);
  doc.text(`Closed: ${closedCount}`, margin + 145, y);
  doc.setTextColor(80);
  doc.text(`Overdue: ${overdueCount}`, margin + 185, y);
  doc.setTextColor(59, 130, 246);
  doc.text(`Actions: ${totalActions}`, margin + 230, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Severity — Critical: ${criticalCount}  |  Major: ${majorCount}  |  Minor: ${minorCount}`, margin, y);
  y += 8;

  // ── FINDINGS TABLE ──
  const headers = ['No.', 'Finding No.', 'Client', 'Site', 'Audit Type', 'ISO Std', 'Clause', 'Title', 'Category', 'Severity', 'Status', 'Auditor', 'Audit Date', 'Due Date', 'Follow-up'];
  const findingsBody = records.map((r: any, i: number) => [
    i + 1,
    r.finding_number || '-',
    r.client_name || '-',
    r.site_location || '-',
    r.audit_type ? (catLabel[r.audit_type] || r.audit_type) : '-',
    r.iso_standard || '-',
    r.clause || '-',
    r.title || '-',
    r.finding_category ? (catLabel[r.finding_category] || r.finding_category) : '-',
    r.severity || '-',
    r.status || '-',
    r.auditor_name || '-',
    r.audit_date || '-',
    r.due_date || '-',
    r.follow_up_date || '-',
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: findingsBody,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, valign: 'middle' },
    headStyles: { fillColor: navy as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 24 },
      9: { halign: 'center', cellWidth: 17 },
      10: { halign: 'center', cellWidth: 20 },
    },
    didParseCell: function (celldata) {
      if (celldata.section === 'body' && celldata.column.index === 9) {
        const val = String(celldata.cell.raw);
        if (val === 'critical') {
          (celldata.cell as any).styles.textColor = [220, 38, 38];
          (celldata.cell as any).styles.fontStyle = 'bold';
        } else if (val === 'major') {
          (celldata.cell as any).styles.textColor = [202, 138, 4];
        }
      }
      if (celldata.section === 'body' && celldata.column.index === 10) {
        const val = String(celldata.cell.raw);
        if (val === 'open') {
          (celldata.cell as any).styles.textColor = [220, 38, 38];
        } else if (val === 'in_progress') {
          (celldata.cell as any).styles.textColor = [202, 138, 4];
        } else if (val === 'closed') {
          (celldata.cell as any).styles.textColor = [34, 139, 34];
        }
      }
    },
  });

  // ── CORRECTIVE ACTIONS ──
  let ay = (doc as any).lastAutoTable?.finalY ?? y;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text('RENCANA TINDAK LANJUT (CORRECTIVE ACTION PLAN)', margin, ay + 12);
  ay += 18;

  const actionHeaders = ['Finding No.', 'Action / Plan', 'Timeline', 'Resources', 'Status', 'Due Date', 'Completion', 'Effectiveness Criteria', 'Follow-up Actions'];
  let firstActionTable = true;
  for (const r of records) {
    const actions = r.corrective_actions || [];
    if (actions.length === 0) continue;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80);
    doc.text(`${r.finding_number || '-'} — ${r.title || ''}`, margin, ay + 4);
    ay += 8;

    const body = actions.map((a: any, i: number) => [
      i + 1,
      a.action_plan || a.action_description || '-',
      a.timeline || '-',
      a.resources_required || '-',
      a.status ? (actStatusLabel[a.status] || a.status) : '-',
      a.due_date || '-',
      a.completion_date || '-',
      a.effectiveness_criteria || '-',
      a.follow_up_actions || '-',
    ]);

    autoTable(doc, {
      startY: ay,
      head: [actionHeaders],
      body,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.5, valign: 'middle' },
      headStyles: { fillColor: [51, 65, 85] as any, textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        4: { halign: 'center', cellWidth: 16 },
      },
      didParseCell: function (celldata) {
        if (celldata.section === 'body' && celldata.column.index === 4) {
          const val = String(celldata.cell.raw);
          if (val === 'pending') {
            (celldata.cell as any).styles.textColor = [100, 100, 100];
          } else if (val === 'in_progress') {
            (celldata.cell as any).styles.textColor = [202, 138, 4];
          } else if (val === 'verified') {
            (celldata.cell as any).styles.textColor = [59, 130, 246];
          } else if (val === 'closed') {
            (celldata.cell as any).styles.textColor = [34, 139, 34];
          }
        }
      },
      pageBreak: firstActionTable ? 'auto' : 'auto',
    });
    ay = (doc as any).lastAutoTable?.finalY ?? ay;
    ay += 10;
    firstActionTable = false;
  }

  // ── FOOTER ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
    doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem Manajemen TI Terintegrasi', margin, pageH - 8);
    doc.setDrawColor(200);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
  }

  doc.save(`audit_trail_report_${new Date().toISOString().split('T')[0]}.pdf`);
}


function _escapeHtml(s: unknown): string {
  const str = String(s ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Print table
 */
export function printTable(data: any[], title: string, columns?: { key: string; label: string }[]) {
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  const labels = columns ? columns.map(c => c.label) : keys;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${_escapeHtml(title)}</title>
      <style>
        @media print {
          @page { margin: 1cm; size: A4 landscape; }
          body { font-family: Arial, sans-serif; }
          h1 { font-size: 18px; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9fafb; }
        }
      </style>
    </head>
    <body>
      <h1>${_escapeHtml(title)}</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            ${labels.map(label => `<th>${_escapeHtml(label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              ${keys.map(key => `<td>${_escapeHtml(row[key])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
