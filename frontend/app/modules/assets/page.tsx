"use client";

import { apiRequest } from "@/lib/auth";
import { useToast } from "@/components/toast";
import ExportButton from '@/components/ExportButton';

import { useEffect, useState, useCallback } from 'react';

import AssetStats from './components/asset-stats';
import AssetFilters from './components/asset-filters';
import AssetTable from './components/asset-table';
import AssetForm from './components/asset-form';
import AssetDetailModal from './components/asset-detail-modal';
import AssetMetadataTab from '../settings/components/asset-metadata-tab';

interface Asset {
  id: number;
  asset_code: string;
  name: string;
  category: string;
  sub_category: string;
  classification: string;
  status: string;
  owner_name: string;
  assigned_to: string;
  location: string;
  created_at: string;
}

interface Pagination {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface Stats {
  total: number;
  by_category: Record<string, number>;
  by_classification: Record<string, number>;
  by_status: Record<string, number>;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function AssetsModule() {
  const toast = useToast();

  // Data state
  const [data, setData] = useState<Asset[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, by_category: {}, by_classification: {}, by_status: {} });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [classification, setClassification] = useState('');
  const [status, setStatus] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [showMetadataManager, setShowMetadataManager] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  const fetchExportData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (subCategory) params.append('sub_category', subCategory);
      if (classification) params.append('classification', classification);
      if (status) params.append('status', status);
      const result = await apiRequest(`/api/assets/export-data?${params}`);
      setExportData(
        (result.data || []).map((r: any, i: number) => ({
          No: i + 1,
          Asset_Code: r.asset_code,
          Name: r.name,
          Category: r.category,
          Sub_Category: r.sub_category,
          Classification: r.classification,
          Status: r.status,
          Owner: r.owner_name || '',
          Assigned_To: r.assigned_to || '',
          Location: r.location || '',
          Created_At: r.created_at,
        }))
      );
    } catch {
      toast.error('Failed to load export data');
    }
  }, [search, category, subCategory, classification, status, toast]);

  const exportColumns = [
    { key: "No", label: "#" },
    { key: "Asset_Code", label: "Asset Code" },
    { key: "Name", label: "Name" },
    { key: "Category", label: "Category" },
    { key: "Sub_Category", label: "Sub-Category" },
    { key: "Classification", label: "Classification" },
    { key: "Status", label: "Status" },
    { key: "Owner", label: "Owner" },
    { key: "Assigned_To", label: "Assigned To" },
    { key: "Location", label: "Location" },
    { key: "Created_At", label: "Created At" },
  ];

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: sortField,
        sort_order: sortDirection
      });

      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (subCategory) params.append('sub_category', subCategory);
      if (classification) params.append('classification', classification);
      if (status) params.append('status', status);

      const result = await apiRequest(`/api/assets?${params}`);
      setData(result.data || []);
      setPagination(result.pagination);
      fetchStats();
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const result = await apiRequest('/api/assets/stats');
      setStats(result);
    } catch {
      setStats({ total: 0, by_category: {}, by_classification: {}, by_status: {} });
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, sortField, sortDirection, category, subCategory, classification, status]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, category, subCategory, classification, status]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== data[0]?.name) { // Avoid infinite loop
        fetchData();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch export data when filters change
  useEffect(() => {
    fetchExportData();
  }, [fetchExportData]);

  // Handle sort
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Handle form submit
  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const form = new FormData();
      
      // Set default values for User sub-categories
      if (formData.sub_category === 'team_member') {
        if (!formData.owner_name) formData.owner_name = 'Admin';
        if (!formData.assigned_to) formData.assigned_to = formData.attributes?.department || 'HR Department';
        if (!formData.location) formData.location = 'Office';
      }
      
      if (formData.sub_category === 'ftp_user') {
        if (!formData.owner_name) formData.owner_name = 'Admin';
        if (!formData.assigned_to) formData.assigned_to = formData.attributes?.requester || 'IT Admin';
        if (!formData.location) formData.location = 'FTP Server';
      }
      
      if (formData.sub_category === 'samba_192' || formData.sub_category === 'samba_sequis') {
        if (!formData.owner_name) formData.owner_name = 'Admin';
        if (!formData.assigned_to) formData.assigned_to = formData.attributes?.group_name || 'IT Admin';
        if (!formData.location) formData.location = 'File Server';
      }
      
      if (formData.sub_category === 'sig_member') {
        if (!formData.owner_name) formData.owner_name = 'Admin';
        if (!formData.assigned_to) formData.assigned_to = 'IT Community';
        if (!formData.location) formData.location = 'Virtual';
      }
      
      Object.keys(formData).forEach(key => {
        if (key === 'attributes') {
          form.append(key, JSON.stringify(formData[key]));
        } else if (formData[key] !== '' && formData[key] !== null) {
          form.append(key, String(formData[key]));
        }
      });

      if (editingAsset) {
        // Update
        form.append('category', formData.category);
        form.append('sub_category', formData.sub_category);
        await apiRequest(`/api/assets/${editingAsset.id}`, {
          method: 'PUT',
          body: form
        });
      } else {
        // Create
        await apiRequest('/api/assets', {
          method: 'POST',
          body: form
        });
      }

      setShowForm(false);
      setEditingAsset(null);
      fetchData();
    } catch {
      toast.error('Failed to save asset. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/assets/${id}`, {
        method: 'DELETE'
      });
      fetchData();
    } catch {
      toast.error('Failed to delete asset. Please try again.');
    }
  };

  const requestDelete = (id: number) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id) {
      await handleDelete(deleteConfirm.id);
    }
    setDeleteConfirm({ open: false, id: null });
  };

  // Handle edit
  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setShowForm(true);
  };

  // Handle view
  const handleView = (asset: Asset) => {
    setViewingAsset(asset);
  };

  // Handle export
  // Handle reset filters
  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setSubCategory('');
    setClassification('');
    setStatus('');
    setPage(1);
  };

  // Close view modal
  const closeViewModal = () => {
    setViewingAsset(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asset Register</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Inventory & classification of information and associated assets (ISO 27001:2022 A.5.9)
          </p>
        </div>
        <div className="flex gap-3">
          <ExportButton
            data={exportData}
            filename="assets-export"
            columns={exportColumns}
            title="Asset Register"
          />
          <button
            onClick={() => setShowMetadataManager(true)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Manage Metadata
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingAsset(null); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Add New Asset
          </button>
        </div>
      </div>

      {/* Stats */}
      <AssetStats stats={stats} />

      {/* Filters */}
      <AssetFilters
        search={search}
        category={category}
        subCategory={subCategory}
        classification={classification}
        status={status}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onSubCategoryChange={setSubCategory}
        onClassificationChange={setClassification}
        onStatusChange={setStatus}
        onReset={handleResetFilters}
      />

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {editingAsset ? 'Edit Asset' : 'Add New Asset'}
              </h2>
              <AssetForm
                asset={editingAsset || undefined}
                category={editingAsset?.category || category || 'users'}
                subCategory={editingAsset?.sub_category || subCategory || (category === 'hardware' ? 'server_rack' : category === 'software' ? 'os_license' : category === 'virtual-infrastructure' ? 'virtual_machine' : category === 'information' ? 'database' : 'team_member')}
                onSubmit={handleSubmit}
                onCancel={() => { setShowForm(false); setEditingAsset(null); }}
                isLoading={submitting}
              />
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewingAsset && (
        <AssetDetailModal
          asset={viewingAsset}
          onClose={() => setViewingAsset(null)}
        />
      )}

      {/* Metadata Management Modal */}
      {showMetadataManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Manage Asset Metadata</h2>
                <button
                  onClick={() => setShowMetadataManager(false)}
                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                >
                  Close
                </button>
              </div>
              <AssetMetadataTab />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-4">⏳</div>
            <p>Loading assets...</p>
          </div>
        </div>
      ) : (
        <>
          <AssetTable
            data={data}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onEdit={handleEdit}
            onDelete={requestDelete}
            onView={handleView}
            pagination={pagination ? {
              page: pagination.page,
              page_size: pagination.page_size,
              total_records: pagination.total_records
            } : undefined}
          />

          {/* Pagination */}
          {pagination && (
            <div className="flex justify-between items-center bg-white dark:bg-slate-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, pagination.total_records)} of {pagination.total_records} entries
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(1)}
                      disabled={!pagination.has_prev}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={!pagination.has_prev}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {page} of {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={!pagination.has_next}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setPage(pagination.total_pages)}
                      disabled={!pagination.has_next}
                      className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1">!</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Confirm Delete
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this asset? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm({ open: false, id: null })}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
