"use client";

import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';

interface PageContainerProps {
  children?: React.ReactNode;
  title: string;
  onAddNew?: () => void;
  showAddButton?: boolean;
  showAddNewButton?: boolean;
  exportData?: any[];
  exportColumns?: { key: string; label: string }[];
  onShowReport?: () => void;
  showReportButton?: boolean;
  reportButtonText?: string;
  isReportOpen?: boolean;
}

export function PageContainer({
  children,
  title,
  onAddNew,
  showAddButton = true,
  showAddNewButton = true,
  exportData,
  exportColumns,
  onShowReport,
  showReportButton = false,
  reportButtonText = '📊 Report',
  isReportOpen = false,
}: PageContainerProps) {
  const toast = useToast();

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export Buttons */}
          {exportData && exportData.length > 0 && (
            <ExportButton
              data={exportData}
              filename={title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}
              columns={exportColumns}
              title={title}
            />
          )}

          {/* Report Button */}
          {showReportButton && onShowReport && (
            <button
              onClick={onShowReport}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: isReportOpen ? 'rgb(220, 38, 38)' : 'rgb(124, 58, 237)',
                color: 'white',
              }}
            >
              {reportButtonText}
            </button>
          )}

          {/* Add New Button */}
          {onAddNew && showAddNewButton && (
            <button
              onClick={() => onAddNew()}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: showAddButton ? 'rgb(37, 99, 235)' : 'rgb(220, 38, 38)',
                color: 'white',
              }}
            >
              {showAddButton ? '+ Add New' : '✕ Cancel'}
            </button>
          )}
        </div>
      </div>
      
      {/* Pass search term to children via context */}
      {children}
    </div>
  );
}

interface DataTableProps {
  columns: { key: string; label: string; sortable?: boolean }[];
  data: any[];
  onDelete?: (id: number) => void;
  onEdit?: (item: any) => void;
  onView?: (item: any) => void;
  loading?: boolean;
  onSearch?: (term: string) => void;
  onSort?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  currentSort?: { sortBy: string; sortOrder: 'asc' | 'desc' };
}

export function DataTable({ 
  columns, 
  data, 
  onDelete, 
  onEdit, 
  onView, 
  loading,
  onSearch,
  onSort,
  currentSort,
}: DataTableProps) {
  const handleSort = (key: string) => {
    if (!onSort) return;
    
    const newOrder = currentSort?.sortBy === key && currentSort?.sortOrder === 'desc' ? 'asc' : 'desc';
    onSort(key, newOrder);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <div className="animate-pulse">Loading data...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-gray-800">
        <table className="w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 ${
                    col.sortable && onSort ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700' : ''
                  }`}
                  onClick={() => col.sortable && onSort && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    <span>{col.label}</span>
                    {col.sortable && currentSort?.sortBy === col.key && (
                      <span className="text-xs">
                        {currentSort.sortOrder === 'desc' ? '🔽' : '🔼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {(onDelete || onEdit || onView) && (
                <th className="px-4 py-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {row[col.key] || '-'}
                  </td>
                ))}
                {(onDelete || onEdit || onView) && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {onView && (
                        <button
                          onClick={() => onView(row)}
                          className="text-green-600 hover:text-green-800"
                          title="View Details"
                        >
                          👁️ View
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(row)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✏️ Edit
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(row.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
