"use client";

import { useState, useEffect, useMemo } from 'react';
import ExportButton from '@/components/ExportButton';

interface BackupRecord {
  server: string;
  date: string;
  files: number;
  files_formatted: string;
  size_bytes: number;
  size_formatted: string;
  status: 'OK' | 'Warning' | 'Critical';
  filename: string;
}

interface BackupTableProps {
  records: BackupRecord[];
  onRecheck: () => void;
  isLoading: boolean;
  onServerClick?: (serverName: string) => void;
}

export function BackupTable({ records, onRecheck, isLoading, onServerClick }: BackupTableProps) {
  const [sort_by, setSortBy] = useState<keyof BackupRecord>('server');
  const [sort_order, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [groupPriority, setGroupPriority] = useState<{[key: string]: number[]}>({
    'server': [1, 2, 3],  // IP ranges: 10.x, 192.x, others
    'date': [1, 2, 3],    // Date ranges: Today, Week, Month, Older
    'files': [1, 2, 3],   // File ranges: 0, 1-1000, 1000+
    'size_formatted': [1, 2, 3],  // Size ranges: 0, <1GB, 1GB+
    'status': [1, 2, 3]   // Status: OK, Warning, Critical
  });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const handleSort = (column: keyof BackupRecord) => {
    if (sort_by === column) {
      // Rotate group priority for this column
      setGroupPriority(prev => ({
        ...prev,
        [column]: [...prev[column].slice(1), prev[column][0]]
      }));
    } else {
      setSortBy(column);
      setSortOrder('asc');
      // Reset group priority to default
      setGroupPriority({
        'server': [1, 2, 3],
        'date': [1, 2, 3],
        'files': [1, 2, 3],
        'size_formatted': [1, 2, 3],
        'status': [1, 2, 3]
      });
    }
  };

  const getSortIcon = (column: keyof BackupRecord) => {
    if (sort_by !== column) return ' \u2195';
    
    // Show which group is on top for each column
    const topGroup = groupPriority[column]?.[0] || 1;
    
    if (column === 'status') {
      if (topGroup === 1) return ' \u2713';
      if (topGroup === 2) return ' \u26A0';
      if (topGroup === 3) return ' \u2717';
    } else if (column === 'date') {
      if (topGroup === 1) return ' Today';
      if (topGroup === 2) return ' Week';
      if (topGroup === 3) return ' Month+';
    } else if (column === 'files') {
      if (topGroup === 1) return ' 0';
      if (topGroup === 2) return ' 1-1K';
      if (topGroup === 3) return ' 1K+';
    } else if (column === 'size_formatted') {
      if (topGroup === 1) return ' 0';
      if (topGroup === 2) return ' <1GB';
      if (topGroup === 3) return ' 1GB+';
    } else if (column === 'server') {
      if (topGroup === 1) return ' 10.x';
      if (topGroup === 2) return ' 192.x';
      if (topGroup === 3) return ' Other';
    }
    
    return sort_order === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // Sort records with grouping for all columns
  const sortedRecords = [...records].sort((a, b) => {
    const aVal = a[sort_by];
    const bVal = b[sort_by];
    
    // Group-based sort for all columns
    if (sort_by === 'status') {
      const getEmojiGroup = (status: string) => {
        if (status.includes('OK')) return 1;
        if (status.includes('Warning')) return 2;
        if (status.includes('Critical')) return 3;
        return 9;
      };
      
      const groupA = getEmojiGroup(String(aVal));
      const groupB = getEmojiGroup(String(bVal));
      
      const priorityA = groupPriority['status'].indexOf(groupA);
      const priorityB = groupPriority['status'].indexOf(groupB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      const getDays = (status: string) => {
        if (status.includes('today')) return 0;
        if (status.includes('Yesterday')) return 1;
        const match = status.match(/(\d+)\s*days/);
        return match ? parseInt(match[1]) : 999;
      };
      
      return getDays(String(aVal)) - getDays(String(bVal));
    }
    
    // Date grouping
    if (sort_by === 'date') {
      const getDateGroup = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysAgo === 0) return 1;  // Today
        if (daysAgo <= 7) return 2;   // This week
        return 3;                      // Month+
      };
      
      const groupA = getDateGroup(String(aVal));
      const groupB = getDateGroup(String(bVal));
      
      const priorityA = groupPriority['date'].indexOf(groupA);
      const priorityB = groupPriority['date'].indexOf(groupB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      return String(aVal).localeCompare(String(bVal));
    }
    
    // Files grouping
    if (sort_by === 'files') {
      const getFileGroup = (files: number) => {
        if (files === 0) return 1;      // 0 files
        if (files <= 1000) return 2;    // 1-1K files
        return 3;                        // 1K+ files
      };
      
      const groupA = getFileGroup(Number(aVal));
      const groupB = getFileGroup(Number(bVal));
      
      const priorityA = groupPriority['files'].indexOf(groupA);
      const priorityB = groupPriority['files'].indexOf(groupB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      return Number(aVal) - Number(bVal);
    }
    
    // Size grouping
    if (sort_by === 'size_formatted') {
      const getSizeGroup = (sizeBytes: number) => {
        if (sizeBytes === 0) return 1;           // 0
        if (sizeBytes < 1024 * 1024 * 1024) return 2;  // <1GB
        return 3;                                 // 1GB+
      };
      
      const groupA = getSizeGroup(Number(aVal));
      const groupB = getSizeGroup(Number(bVal));
      
      const priorityA = groupPriority['size_formatted'].indexOf(groupA);
      const priorityB = groupPriority['size_formatted'].indexOf(groupB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      return Number(aVal) - Number(bVal);
    }
    
    // Server IP grouping
    if (sort_by === 'server') {
      const getServerGroup = (ip: string) => {
        if (ip.startsWith('10.')) return 1;      // 10.x.x.x
        if (ip.startsWith('192.')) return 2;     // 192.168.x.x
        return 3;                                 // Other
      };
      
      const groupA = getServerGroup(String(aVal));
      const groupB = getServerGroup(String(bVal));
      
      const priorityA = groupPriority['server'].indexOf(groupA);
      const priorityB = groupPriority['server'].indexOf(groupB);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      return String(aVal).localeCompare(String(bVal));
    }
    
    // Default sort for other cases
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort_order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    const comparison = String(aVal).localeCompare(String(bVal));
    return sort_order === 'asc' ? comparison : -comparison;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedRecords.length / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedRecords = sortedRecords.slice(startIdx, endIdx);

  // Reset to page 1 when sort or data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sort_by, sort_order, records.length]);

  const exportColumns = [
    { key: "No", label: "#" },
    { key: "Server", label: "Server" },
    { key: "Last_Backup", label: "Last Backup" },
    { key: "Files", label: "Files" },
    { key: "Size", label: "Size" },
    { key: "Status", label: "Status" },
  ];

  const exportData = useMemo(() => {
    return records.map((r, i) => ({
      No: i + 1,
      Server: r.server,
      Last_Backup: r.date,
      Files: r.files_formatted,
      Size: r.size_formatted,
      Status: r.status,
    }));
  }, [records]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'OK':
        return { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '#22c55e' };
      case 'Warning':
        return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '#f59e0b' };
      case 'Critical':
        return { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '#ef4444' };
      default:
        return { bg: 'rgb(55, 65, 81)', color: 'rgb(249, 250, 251)', border: 'rgb(55, 65, 81)' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OK':
        return '\u2713';
      case 'Warning':
        return '\u26A0';
      case 'Critical':
        return '\u2717';
      default:
        return '?';
    }
  };

  return (
    <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-gray-800">
      <div className="px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Backup Status by Server
          </h3>
          <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
            {records.length > 0 
              ? `Showing ${records.length} server(s) • Last updated from database`
              : 'No backup data available - Click "Check Backups" to fetch from NAS'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRecheck} disabled={isLoading} className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            Re-check
          </button>
          <ExportButton
            data={exportData}
            filename="backup-check-report"
            columns={exportColumns}
            title="Backup Check Report"
          />
        </div>
      </div>

      {/* Table */}
      {records.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-2xl mb-4 font-semibold">No servers found</p>
          <p className="text-sm mt-2">Click "Check Backups" to scan NAS and add servers</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onClick={() => handleSort('server')}>
                  Server{getSortIcon('server')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onClick={() => handleSort('date')}>
                  Last Backup{getSortIcon('date')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onClick={() => handleSort('files')}>
                  Files{getSortIcon('files')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onClick={() => handleSort('size_formatted')}>
                  Size{getSortIcon('size_formatted')}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onClick={() => handleSort('status')}>
                  Status{getSortIcon('status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedRecords.map((record, index) => {
                const statusStyle = getStatusStyle(record.status);
                return (
                  <tr key={index} className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}`}>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm cursor-pointer hover:text-blue-600 text-gray-900 dark:text-white" onClick={() => onServerClick && onServerClick(record.server)} title="Click to view history">
                      {record.server}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{record.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">{record.files_formatted}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">{record.size_formatted}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                          border: `1px solid ${statusStyle.border}`
                        }}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {records.length > 0 && (
        <div>
          {/* Pagination Controls */}
          <div className="px-6 py-4 flex items-center justify-between bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Rows:</span>
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {startIdx + 1}-{Math.min(endIdx, sortedRecords.length)} of {sortedRecords.length} servers
              </span>

              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" title="First page">First</button>
                <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} className="px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" title="Previous page">Prev</button>

                <span className="text-sm font-medium text-gray-900 dark:text-white">Page {currentPage} of {totalPages}</span>

                <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" title="Next page">Next</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" title="Last page">Last</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
