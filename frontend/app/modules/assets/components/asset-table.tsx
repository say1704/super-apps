"use client";

import { apiRequest } from "@/lib/auth";


import { useState } from 'react';

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
  attributes?: Record<string, any>;
  created_at: string;
}

interface AssetTableProps {
  data: Asset[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
  onEdit: (asset: Asset) => void;
  onDelete: (id: number) => void;
  onView: (asset: Asset) => void;
  pagination?: {
    page: number;
    page_size: number;
    total_records: number;
  };
}

const classificationColors: Record<string, string> = {
  'public': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'internal': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'confidential': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
};

const classificationLabels: Record<string, string> = {
  'public': 'Public',
  'internal': 'Internal',
  'confidential': 'Confidential'
};

const statusColors: Record<string, string> = {
  'active': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'in-maintenance': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'retired': 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  'lost': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
};

const statusLabels: Record<string, string> = {
  'active': 'Active',
  'in-maintenance': 'In Maintenance',
  'retired': 'Retired',
  'lost': 'Lost'
};

const categoryIcons: Record<string, string> = {
  'users': 'USR',
  'hardware': 'HW',
  'software': 'SW',
  'virtual-infrastructure': 'VI',
  'information': 'INFO'
};

export default function AssetTable({
  data,
  sortField,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  onView,
  pagination
}: AssetTableProps) {
  const [passwordStates, setPasswordStates] = useState<Map<number, { visible: boolean; decrypted: string; loading: boolean }>>(new Map());
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [verificationPassword, setVerificationPassword] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Detect if data contains mixed categories
  const categories = Array.from(new Set(data.map(a => a.category)));
  const isMixedCategories = categories.length > 1;
  
  // Detect if data contains mixed sub-categories within Users category
  const isUsersCategory = data.every(a => a.category === 'users');
  const userSubCategories = Array.from(new Set(data.filter(a => a.category === 'users').map(a => a.sub_category)));
  const isMixedUserSubCategories = userSubCategories.length > 1;

  // Calculate row number for pagination
  const getRowNumber = (index: number) => {
    if (pagination) {
      return ((pagination.page - 1) * pagination.page_size) + index + 1;
    }
    return index + 1;
  };

  const handleRequestPassword = (assetId: number) => {
    setSelectedAssetId(assetId);
    setVerificationPassword('');
    setVerificationError('');
    setShowPasswordModal(true);
  };

  const verifyAndDecrypt = async () => {
    if (!verificationPassword.trim()) {
      setVerificationError('Password verification is required');
      return;
    }

    if (!selectedAssetId) return;

    setVerifying(true);
    try {
      const result = await apiRequest(`/api/assets/${selectedAssetId}/decrypt-password`, {
        method: 'POST',
        body: JSON.stringify({ verification_password: verificationPassword }),
      });

      if (result.password) {
        setPasswordStates(prev => new Map(prev).set(selectedAssetId, {
          visible: true,
          decrypted: result.password,
          loading: false
        }));
        setShowPasswordModal(false);
        setVerificationPassword('');
      } else {
        setVerificationError('Incorrect password or password not set');
      }
    } catch {
      setVerificationError('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const togglePasswordVisibility = (assetId: number) => {
    const currentState = passwordStates.get(assetId) || { visible: false, decrypted: '', loading: false };

    if (currentState.visible) {
      // Hide password
      setPasswordStates(prev => new Map(prev).set(assetId, { ...currentState, visible: false }));
    } else {
      // Request verification password
      handleRequestPassword(assetId);
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return '\u2195';
    return sortDirection === 'asc' ? '\u25B2' : '\u25BC';
  };

  const handleSort = (field: string) => {
    onSort(field);
  };

  return (
    <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800">
      {/* Hardware Summary */}
      {data.some(a => a.category === 'hardware') && pagination && (
        <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-purple-700 dark:text-purple-300 bg-purple-200 dark:bg-purple-800 rounded px-2 py-1">HW</span>
              <div>
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                  Hardware Assets
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Showing {((pagination.page - 1) * pagination.page_size) + 1} to {Math.min(pagination.page * pagination.page_size, pagination.total_records)} of {pagination.total_records} entries
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium">
                Total: {pagination.total_records}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-700">
            <tr>
              {/* Use default table for mixed categories or mixed user sub-categories */}
              {isMixedCategories || isMixedUserSubCategories ? (
                <>
                  <th
                    onClick={() => handleSort('asset_code')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Asset Code {getSortIcon('asset_code')}
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th
                    onClick={() => handleSort('category')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Category {getSortIcon('category')}
                  </th>
                  <th
                    onClick={() => handleSort('sub_category')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Sub-Category {getSortIcon('sub_category')}
                  </th>
                  <th
                    onClick={() => handleSort('classification')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Classification {getSortIcon('classification')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th
                    onClick={() => handleSort('owner_name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Owner {getSortIcon('owner_name')}
                  </th>
                  <th
                    onClick={() => handleSort('assigned_to')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Assigned To {getSortIcon('assigned_to')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'users' && a.sub_category === 'team_member') ? (
                <>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    No. Telp
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Department
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'users' && a.sub_category === 'ftp_user') ? (
                <>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    FTP Username {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Kategori
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    FTP Password
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Pemohon
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Tanggal Pembuatan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Catatan
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'users' && a.sub_category === 'samba_192') ? (
                <>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    No. {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Group Name
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'users' && a.sub_category === 'samba_sequis') ? (
                <>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Group Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Password
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Permission
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Email
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Actions {getSortIcon('status')}
                  </th>
                </>
              ) : data.some(a => a.category === 'users' && a.sub_category === 'sig_member') ? (
                <>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Nama Kelompok {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Jenis Kepentingan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Pihak Internal
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Komunikasi
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'hardware') ? (
                <>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    #
                  </th>
                  <th
                    onClick={() => handleSort('asset_code')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Asset Number {getSortIcon('asset_code')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Device Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Model Name
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Device Name {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Serial Number
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    IP Address
                  </th>
                  <th
                    onClick={() => handleSort('location')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Location {getSortIcon('location')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Keterangan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'virtual-infrastructure') ? (
                <>
                  <th
                    onClick={() => handleSort('asset_code')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Asset Code {getSortIcon('asset_code')}
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Host/Provider
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    OS/Platform
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th
                    onClick={() => handleSort('owner_name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Owner {getSortIcon('owner_name')}
                  </th>
                  <th
                    onClick={() => handleSort('assigned_to')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Assigned To {getSortIcon('assigned_to')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : data.some(a => a.category === 'software') ? (
                <>
                  <th
                    onClick={() => handleSort('asset_code')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Asset Code {getSortIcon('asset_code')}
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    License
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Main Function
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Department
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th
                    onClick={() => handleSort('owner_name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Owner {getSortIcon('owner_name')}
                  </th>
                  <th
                    onClick={() => handleSort('assigned_to')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Assigned To {getSortIcon('assigned_to')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              ) : (
                <>
                  <th
                    onClick={() => handleSort('asset_code')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Asset Code {getSortIcon('asset_code')}
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th
                    onClick={() => handleSort('category')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Category {getSortIcon('category')}
                  </th>
                  <th
                    onClick={() => handleSort('classification')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Classification {getSortIcon('classification')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </th>
                  <th
                    onClick={() => handleSort('owner_name')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Owner {getSortIcon('owner_name')}
                  </th>
                  <th
                    onClick={() => handleSort('assigned_to')}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                  >
                    Assigned To {getSortIcon('assigned_to')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((asset, index) => (
              <tr
                key={asset.id}
                className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                {/* Use default rendering for mixed categories or mixed user sub-categories */}
                {isMixedCategories || isMixedUserSubCategories ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {categoryIcons[asset.category]} {asset.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.sub_category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${classificationColors[asset.classification] || classificationColors.internal}`}>
                        {classificationLabels[asset.classification] || asset.classification}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.owner_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.assigned_to || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'users' && asset.sub_category === 'team_member' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.department || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'users' && asset.sub_category === 'ftp_user' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium font-mono text-sm">
                      {asset.attributes?.username || asset.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.category || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono min-w-[120px]">
                          {passwordStates.get(asset.id)?.loading ? (
                            <span className="text-gray-400">Loading...</span>
                          ) : passwordStates.get(asset.id)?.visible && passwordStates.get(asset.id)?.decrypted
                            ? passwordStates.get(asset.id)?.decrypted
                            : '••••••••'}
                        </span>
                        {!passwordStates.get(asset.id)?.loading && (
                          <button
                            onClick={() => togglePasswordVisibility(asset.id)}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            title={passwordStates.get(asset.id)?.visible ? 'Hide password' : 'Show password'}
                          >
                            {passwordStates.get(asset.id)?.visible ? 'Hide' : 'View'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.requester || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.created_date || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm max-w-xs truncate">
                      {asset.attributes?.notes || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'users' && asset.sub_category === 'samba_192' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {asset.attributes?.username || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.group_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'users' && asset.sub_category === 'samba_sequis' ? (
                  <>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {asset.attributes?.username || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.group_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono min-w-[120px]">
                          {passwordStates.get(asset.id)?.loading ? (
                            <span className="text-gray-400">Loading...</span>
                          ) : passwordStates.get(asset.id)?.visible && passwordStates.get(asset.id)?.decrypted
                            ? passwordStates.get(asset.id)?.decrypted
                            : '••••••••'}
                        </span>
                        {!passwordStates.get(asset.id)?.loading && asset.attributes?.password && (
                          <button
                            onClick={() => togglePasswordVisibility(asset.id)}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            title={passwordStates.get(asset.id)?.visible ? 'Hide password' : 'Show password'}
                          >
                            {passwordStates.get(asset.id)?.visible ? 'Hide' : 'View'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        asset.attributes?.permission_level === 'Admin' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                        asset.attributes?.permission_level === 'Read/Write' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}>
                        {asset.attributes?.permission_level || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.account_status === 'Active' ? (
                        <span className="px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Active</span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Disabled</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.email || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'users' && asset.sub_category === 'sig_member' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm max-w-xs truncate">
                      {asset.attributes?.interest_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.responsible_party || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.communication_mechanism || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'hardware' ? (
                  <>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {getRowNumber(index)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {asset.sub_category === 'server_rack' ? 'Server Rack' :
                         asset.sub_category === 'server_tower' ? 'Server Tower' :
                         asset.sub_category === 'kvm' ? 'KVM' :
                         asset.sub_category === 'laptop' ? 'Laptop' :
                         asset.sub_category === 'disk_sas' ? 'Disk / SAS' :
                         asset.sub_category === 'tape_cassette' ? 'Tape Cassette' :
                         asset.sub_category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.model || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {asset.attributes?.serial_number || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {asset.attributes?.ip_address || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.location || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm max-w-xs truncate">
                      {asset.attributes?.keterangan || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'virtual-infrastructure' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                        VI {asset.sub_category === 'virtual_machine' ? 'Virtual Machine' :
                            asset.sub_category === 'container' ? 'Container' :
                            asset.sub_category === 'cloud_instance' ? 'Cloud Instance' :
                            asset.sub_category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-mono">
                      {asset.attributes?.ip_address || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.host_server || asset.attributes?.host || asset.attributes?.cloud_provider || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.os || asset.attributes?.platform || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.owner_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.assigned_to || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : asset.category === 'software' ? (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.version || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        asset.attributes?.license === 'freeware' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                        asset.attributes?.license === 'open-source' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                        'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      }`}>
                        {asset.attributes?.license === 'perpetual' ? 'Perpetual' :
                         asset.attributes?.license === 'subscription' ? 'Subscription' :
                         asset.attributes?.license === 'volume' ? 'Volume' :
                         asset.attributes?.license === 'freeware' ? 'Freeware' :
                         asset.attributes?.license === 'open-source' ? 'Open Source' :
                         asset.attributes?.license || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm max-w-xs truncate">
                      {asset.attributes?.main_function || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.attributes?.department ? (asset.attributes.department === 'all' ? 'All' :
                        asset.attributes.department === 'it' ? 'IT/Sysadmin' :
                        asset.attributes.department === 'network' ? 'Network' :
                        asset.attributes.department === 'security' ? 'Security' :
                        asset.attributes.department === 'database' ? 'Database' :
                        asset.attributes.department === 'helpdesk' ? 'Helpdesk' :
                        asset.attributes.department === 'hr' ? 'HR' :
                        asset.attributes.department === 'finance' ? 'Finance' :
                        asset.attributes.department === 'operations' ? 'Operations' :
                        asset.attributes.department === 'sales' ? 'Sales' :
                        asset.attributes.department === 'production' ? 'Production' :
                        asset.attributes.department === 'procurement' ? 'Procurement' :
                        asset.attributes.department === 'legal' ? 'Legal' :
                        asset.attributes.department === 'management' ? 'Management' :
                        asset.attributes.department) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.owner_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.assigned_to || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-sm">
                      {asset.asset_code}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {categoryIcons[asset.category]} {asset.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${classificationColors[asset.classification] || classificationColors.internal}`}>
                        {classificationLabels[asset.classification] || asset.classification}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors[asset.status] || statusColors.active}`}>
                        {statusLabels[asset.status] || asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.owner_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                      {asset.assigned_to || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onView(asset)}
                          className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium"
                          title="View Details"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(asset)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(asset.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          title="Delete"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-4 font-bold text-gray-400">ASSET</div>
          <p className="text-lg font-medium">No assets found</p>
          <p className="text-sm mt-1">Try adjusting your filters or add a new asset</p>
        </div>
      )}

      {/* Password Verification Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded px-2 py-1">PW</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Password Verification Required
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter <strong>your login password</strong> to view this asset password. This action will be logged for security.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Your Password *
                </label>
                <input
                  type="password"
                  value={verificationPassword}
                  onChange={(e) => {
                    setVerificationPassword(e.target.value);
                    setVerificationError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && verifyAndDecrypt()}
                  placeholder="Enter your login password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {verificationError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{verificationError}</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setVerificationPassword('');
                    setVerificationError('');
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  disabled={verifying}
                >
                  Cancel
                </button>
                <button
                  onClick={verifyAndDecrypt}
                  disabled={verifying}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'View Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
