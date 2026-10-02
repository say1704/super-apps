"use client";

import { apiRequest } from "@/lib/auth";

import { useEffect, useState } from 'react';

import { PageContainer, DataTable } from '@/components/page-container';
import { useToast } from '@/components/toast';
import ExportButton from '@/components/ExportButton';
import { LogForm } from './components/log-form';
import { ImportXlsPanel } from './components/import-xls-modal';
import { SearchFilterSection } from './components/search-filter-section';
import { ReportSection } from './components/report-section';
import { LogDetailModal } from './components/log-detail-modal';
import { AnalyticsCards } from './components/analytics-cards';

interface LogMaintenance {
  id: number;
  server: string;
  path: string;
  script_execution: string;
  execution_date: string;
  size: string;
  notes: string;
  version?: number;
}

interface ServerReport {
  server: string;
  total_logs: number;
  total_size_gb: number;
  last_execution: string;
  logs: any[];
}

interface ReportData {
  summary: ServerReport[];
  total_servers: number;
  total_logs: number;
  total_size_gb: number;
  filters: any;
}

interface LogFormData {
  server: string;
  path: string;
  script_execution: string;
  execution_date: string;
  size: string;
  notes: string;
}

interface ReportFilters {
  server: string;
  year: string;
  month: string;
}

interface AvailableFilters {
  servers: string[];
  years: number[];
  months: number[];
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export default function LogMaintenanceModule() {
  // Data states
  const [data, setData] = useState<LogMaintenance[]>([]);
  const [filteredData, setFilteredData] = useState<LogMaintenance[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<LogFormData>({
    server: '',
    path: '',
    script_execution: '',
    execution_date: new Date().toISOString().split('T')[0],
    size: '',
    notes: '',
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSize, setFilterSize] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Report states
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [advancedData, setAdvancedData] = useState<any | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [reportFilters, setReportFilters] = useState<ReportFilters>({
    server: '',
    year: '',
    month: '',
  });
  const [availableFilters, setAvailableFilters] = useState<AvailableFilters>({
    servers: [],
    years: [],
    months: [],
  });

  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LogMaintenance | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);

  const toast = useToast();

  // Filter data based on search, size, and date
  const filterData = () => {
    let result = [...data];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.server.toLowerCase().includes(term) ||
        item.path.toLowerCase().includes(term) ||
        item.notes?.toLowerCase().includes(term)
      );
    }

    if (filterSize !== 'all') {
      result = result.filter(item => item.size?.includes(filterSize));
    }

    if (dateFrom) {
      result = result.filter(item => item.execution_date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(item => item.execution_date <= dateTo);
    }

    setFilteredData(result);
  };

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      const result = await apiRequest(`/api/log-maintenance?${params}`);
      const records = Array.isArray(result) ? result : (result.data || []);
      setData(records);
      setFilteredData(records);
      if (result.pagination) {
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize]);

  // Fetch available filters for report
  const fetchAvailableFilters = async () => {
    try {
      const result = await apiRequest('/api/log-maintenance/reports/available-filters');
      setAvailableFilters(result);
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  };

  // Fetch report data
  const fetchReportData = async () => {
    setReportLoading(true);
    setAdvancedLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportFilters.server) params.append('server', reportFilters.server);
      if (reportFilters.year) params.append('year', reportFilters.year);
      if (reportFilters.month) params.append('month', reportFilters.month);

      const [summaryResult, advancedResult] = await Promise.all([
        apiRequest(`/api/log-maintenance/reports/summary?${params.toString()}`),
        apiRequest(`/api/log-maintenance/reports/advanced?${params.toString()}`),
      ]);
      setReportData(summaryResult);
      setAdvancedData(advancedResult);
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Failed to load report data');
    } finally {
      setReportLoading(false);
      setAdvancedLoading(false);
    }
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formData.server.trim()) {
      toast.error('Server name is required');
      return;
    }

    const form = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      form.append(key, value);
    });

    try {
      if (editingId) {
        const headers: Record<string, string> = {};
        const currentItem = data.find(d => d.id === editingId);
        if (currentItem?.version) {
          headers['X-Resource-Version'] = String(currentItem.version);
        }
        await apiRequest(`/api/log-maintenance/${editingId}`, { method: 'PUT', body: form, headers: Object.keys(headers).length ? headers : undefined });
        toast.success('Log entry updated successfully!');
      } else {
        await apiRequest('/api/log-maintenance', { method: 'POST', body: form });
        toast.success('Log entry created successfully!');
      }

      setShowForm(false);
      setEditingId(null);
      setFormData({
        server: '',
        path: '',
        script_execution: '',
        execution_date: new Date().toISOString().split('T')[0],
        size: '',
        notes: '',
      });
      fetchData();
    } catch (error) {
      toast.error('Failed to save log entry');
    }
  };

  // Handle edit
  const handleEdit = (item: LogMaintenance) => {
    setEditingId(item.id);
    setFormData({
      server: item.server,
      path: item.path || '',
      script_execution: item.script_execution || '',
      execution_date: item.execution_date,
      size: item.size,
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  // Handle view detail
  const handleViewDetail = (item: LogMaintenance) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await apiRequest(`/api/log-maintenance/${id}`, { method: 'DELETE' });
      toast.success('Log entry deleted successfully!');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete log entry');
    }
  };

  // Initialize data
  useEffect(() => {
    fetchData();
    fetchAvailableFilters();
    fetchAdvancedData();
  }, []);

  // Fetch advanced analytics on mount
  const fetchAdvancedData = async () => {
    setAdvancedLoading(true);
    try {
      const result = await apiRequest('/api/log-maintenance/reports/advanced');
      setAdvancedData(result);
    } catch (error) {
      console.error('Error fetching advanced data:', error);
    } finally {
      setAdvancedLoading(false);
    }
  };

  // Apply filters when filter values change
  useEffect(() => {
    filterData();
  }, [searchTerm, filterSize, dateFrom, dateTo, data]);

  const columns = [
    { key: 'server', label: 'Server' },
    { key: 'path', label: 'Path' },
    { key: 'script_execution', label: 'Script' },
    { key: 'execution_date', label: 'Execution Date' },
    { key: 'size', label: 'Size' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <PageContainer
        title="Log Deletion"
        onAddNew={() => {
          setEditingId(null);
          setFormData({
            server: '',
            path: '',
            script_execution: '',
            execution_date: new Date().toISOString().split('T')[0],
            size: '',
            notes: '',
          });
          setShowForm(!showForm);
        }}
        showAddButton={!showForm && !showReport}
        showAddNewButton={!showReport}
        exportData={showReport && reportData && reportData.summary ? reportData.summary.map((item: ServerReport) => ({
          Server: item.server,
          'Total Logs': item.total_logs,
          'Total Size (GB)': item.total_size_gb,
          'Last Execution': item.last_execution
        })) : filteredData}
        exportColumns={showReport && reportData ? undefined : columns}
        onShowReport={() => {
          if (showReport) {
            setShowReport(false);
            setReportData(null);
          } else {
            setShowReport(true);
            fetchReportData();
          }
        }}
        showReportButton={true}
        reportButtonText={showReport ? 'Close Report' : 'Report'}
        isReportOpen={showReport}
      />

      {/* Import toolbar */}
      {!showReport && !showForm && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowImport(!showImport)}
            className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm"
          >
            {showImport ? 'Tutup Import' : '📥 Import XLS/CSV/ODS'}
          </button>
        </div>
      )}
      {showImport && !showReport && (
        <ImportXlsPanel onImported={fetchData} onCancel={() => setShowImport(false)} />
      )}

      {/* Report Section */}
      <ReportSection
        show={showReport}
        loading={reportLoading}
        data={reportData}
        advancedData={advancedData}
        advancedLoading={advancedLoading}
        filters={reportFilters}
        availableFilters={availableFilters}
        onGenerate={fetchReportData}
        onReset={() => setReportFilters({ server: '', year: '', month: '' })}
        onFilterChange={setReportFilters}
        onClose={() => {
          setShowReport(false);
          setReportData(null);
          setAdvancedData(null);
        }}
      />

      {/* Search & Filter Section */}
      <SearchFilterSection
        searchTerm={searchTerm}
        filterSize={filterSize}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearchChange={setSearchTerm}
        onSizeChange={setFilterSize}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => {
          setSearchTerm('');
          setFilterSize('all');
          setDateFrom('');
          setDateTo('');
        }}
        total={data.length}
        filtered={filteredData.length}
      />

      {/* Sticky Analytics Cards */}
      <AnalyticsCards advancedData={advancedData} loading={advancedLoading} />

      {/* Log Form */}
      {showForm && (
        <LogForm
          editingId={editingId}
          formData={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
            setFormData({
              server: '',
              path: '',
              script_execution: '',
              execution_date: new Date().toISOString().split('T')[0],
              size: '',
              notes: '',
            });
          }}
        />
      )}

      {/* Detail Modal */}
      <LogDetailModal
        item={selectedItem}
        show={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onEdit={handleEdit}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredData}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onView={handleViewDetail}
        loading={loading}
      />

      {/* Pagination Controls */}
      {pagination && (
        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {data.length} of {pagination.total_records} entries
                </span>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rows:</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={!pagination.has_prev}
                    className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={!pagination.has_prev}
                    className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    «
                  </button>
                  <span className="text-sm px-2 text-gray-700 dark:text-gray-300">
                    Page {page} of {pagination.total_pages || 1}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={!pagination.has_next}
                    className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    »
                  </button>
                  <button
                    onClick={() => setPage(pagination.total_pages)}
                    disabled={!pagination.has_next}
                    className="px-2 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    »»
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
