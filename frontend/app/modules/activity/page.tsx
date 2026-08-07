"use client";

import { useEffect, useState } from 'react';
import { apiRequest, useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import ActivityTable from './components/activity-table';
import ActivityFilters from './components/activity-filters';

interface PaginationInfo {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface ActivityLog {
  id: number;
  timestamp: string;
  log_type: string;
  user: string;
  action: string;
  module: string;
  description: string;
  ip_address: string;
  asset_code?: string;
}

export default function ActivityModule() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(50);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);

  // Sorting states
  const [sort_by, setSortBy] = useState('created_at');
  const [sort_order, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', page_size.toString());
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const result = await apiRequest(`/api/activity-logs?${params.toString()}`);
      setData(result.data || result);
      setPagination(result.pagination);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load activity logs');
      if (error?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, page_size, sort_by, sort_order]);

  const handleSort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setSortBy(sortBy);
    setSortOrder(sortOrder);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-500 dark:text-gray-400 font-medium">Loading activity logs...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {user?.role === 'superadmin' ? 'Track all user activities across the system' : 'Menampilkan activity Anda'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(`/api/proxy/api/v1/activity-logs/export?format=csv`, '_blank')}
              className="px-4 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
            >
              Export CSV
            </button>
            <button
              onClick={fetchData}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <ActivityFilters
        page={page}
        page_size={page_size}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ActivityTable
        data={data}
        sort_by={sort_by}
        sort_order={sort_order}
        onSort={handleSort}
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
