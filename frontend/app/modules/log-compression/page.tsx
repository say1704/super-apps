"use client";

import { apiRequest } from "@/lib/auth";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PageContainer, DataTable } from '@/components/page-container';
import { useToast } from '@/components/toast';
import { CompressionForm } from './components/compression-form';
import { CompressionReport } from './components/compression-report';
import { CompressionDetailModal } from './components/compression-detail-modal';
import { SearchFilterSection } from './components/search-filter-section';

interface LogCompression {
  id: number;
  server: string;
  archive_info: string;
  execution_date: string;
  notes: string;
  version?: number;
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface CompressionFormData {
  server: string;
  archive_info: string;
  execution_date: string;
  notes: string;
}

interface ReportData {
  summary: any[];
  total_servers: number;
  total_archives: number;
  filters: any;
}

interface ReportFilters {
  server: string;
  year: string;
}

interface AvailableFilters {
  servers: string[];
  years: number[];
}

export default function LogCompressionModule() {
  const router = useRouter();
  const [data, setData] = useState<LogCompression[]>([]);
  const [filteredData, setFilteredData] = useState<LogCompression[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LogCompression | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFilters, setReportFilters] = useState<ReportFilters>({
    server: '',
    year: '',
  });
  const [availableFilters, setAvailableFilters] = useState<AvailableFilters>({
    servers: [],
    years: [],
  });

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterServer, setFilterServer] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(20);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);

  // Sorting states
  const [sort_by, setSortBy] = useState('execution_date');
  const [sort_order, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [formData, setFormData] = useState<CompressionFormData>({
    server: '',
    archive_info: '',
    execution_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const toast = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: page_size.toString(),
        sort_by: sort_by,
        sort_order: sort_order,
      });

      const result = await apiRequest(`/api/log-compression?${params}`);
      setData(result.data);
      setFilteredData(result.data);
      setPagination(result.pagination);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      if (error.message?.includes('401')) {
        toast.error('Session expired. Please login again.');
        router.push('/login');
      } else {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, page_size, sort_by, sort_order]);

  const filterData = () => {
    let result = [...data];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.server.toLowerCase().includes(term) ||
        item.archive_info.toLowerCase().includes(term) ||
        item.notes?.toLowerCase().includes(term)
      );
    }

    if (filterServer !== 'all') {
      result = result.filter(item => item.server === filterServer);
    }

    if (dateFrom) {
      result = result.filter(item => item.execution_date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(item => item.execution_date <= dateTo);
    }

    setFilteredData(result);
  };

  useEffect(() => {
    filterData();
  }, [searchTerm, filterServer, dateFrom, dateTo, data]);

  const fetchAvailableFilters = async () => {
    try {
      const result = await apiRequest('/api/log-compression/reports/available-filters');
      setAvailableFilters(result);
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  };

  const fetchReportData = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportFilters.server) params.append('server', reportFilters.server);
      if (reportFilters.year) params.append('year', reportFilters.year);
      
      const result = await apiRequest(`/api/log-compression/reports/summary?${params.toString()}`);
      setReportData(result);
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Failed to load report data');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableFilters();
  }, []);

  const handleSubmit = async () => {
    if (!formData.server.trim() || !formData.archive_info.trim()) {
      toast.error('Server and Archive Info are required');
      return;
    }

    const form = new FormData();
    form.append('server', formData.server);
    form.append('archive_info', formData.archive_info);
    form.append('execution_date', formData.execution_date);
    form.append('notes', formData.notes || '');

    try {
      if (editingId) {
        const headers: Record<string, string> = {};
        const currentItem = data.find(d => d.id === editingId);
        if (currentItem?.version) {
          headers['X-Resource-Version'] = String(currentItem.version);
        }
        await apiRequest(`/api/log-compression/${editingId}`, { method: 'PUT', body: form, headers: Object.keys(headers).length ? headers : undefined });
        toast.success('Compression record updated!');
      } else {
        await apiRequest('/api/log-compression', { method: 'POST', body: form });
        toast.success('Compression record created!');
      }
      
      setShowForm(false);
      setEditingId(null);
      setFormData({
        server: '',
        archive_info: '',
        execution_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      fetchData();
    } catch (error) {
      toast.error('Failed to save record');
    }
  };

  const handleEdit = (item: LogCompression) => {
    setEditingId(item.id);
    setFormData({
      server: item.server,
      archive_info: item.archive_info,
      execution_date: item.execution_date,
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  const handleViewDetail = (item: LogCompression) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this compression record?')) return;

    try {
      await apiRequest(`/api/log-compression/${id}`, { method: 'DELETE' });
      toast.success('Compression record deleted!');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  const columns = [
    { key: 'server', label: 'Server', sortable: true },
    { key: 'archive_info', label: 'Archive Info', sortable: true },
    { key: 'execution_date', label: 'Date', sortable: true },
    { key: 'notes', label: 'Notes', sortable: false },
  ];

  const handleSort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setSortBy(sortBy);
    setSortOrder(sortOrder);
    setPage(1);
  };

  return (
    <div>
      <PageContainer
        title="Log Compression"
        onAddNew={() => {
          setEditingId(null);
          setFormData({
            server: '',
            archive_info: '',
            execution_date: new Date().toISOString().split('T')[0],
            notes: '',
          });
          setShowForm(!showForm);
        }}
        showAddButton={!showForm && !showReport}
        showAddNewButton={!showReport}
        exportData={data}
        exportColumns={columns}
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

      {/* Report Section */}
      <CompressionReport
        show={showReport}
        loading={reportLoading}
        data={reportData}
        filters={reportFilters}
        availableFilters={availableFilters}
        onGenerate={fetchReportData}
        onReset={() => setReportFilters({ server: '', year: '' })}
        onFilterChange={setReportFilters}
        onClose={() => {
          setShowReport(false);
          setReportData(null);
        }}
      />

      {/* Search & Filter Section */}
      <SearchFilterSection
        searchTerm={searchTerm}
        filterSize={filterServer}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearchChange={setSearchTerm}
        onSizeChange={setFilterServer}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => {
          setSearchTerm('');
          setFilterServer('all');
          setDateFrom('');
          setDateTo('');
        }}
        total={data.length}
        filtered={filteredData.length}
      />

      {/* Form Section */}
      {showForm && (
        <CompressionForm
          editingId={editingId}
          formData={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
            setFormData({
              server: '',
              archive_info: '',
              execution_date: new Date().toISOString().split('T')[0],
              notes: '',
            });
          }}
        />
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredData}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onView={handleViewDetail}
        loading={loading}
        onSort={handleSort}
        currentSort={{ sortBy: sort_by, sortOrder: sort_order }}
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
                {/* Page Size Selector */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rows:</label>
                  <select
                    value={page_size}
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
                
                {/* Page Navigation */}
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

      {/* Detail Modal */}
      <CompressionDetailModal
        item={selectedItem}
        show={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onEdit={handleEdit}
      />
    </div>
  );
}
