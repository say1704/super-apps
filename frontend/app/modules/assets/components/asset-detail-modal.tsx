// frontend/app/modules/assets/components/asset-detail-modal.tsx

"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';
import ConfigList from './config/config-list';
import ConfigForm from './config/config-form';
import DeleteConfirm from './config/delete-confirm';
import ConfigHistory from './config/config-history';

interface Asset {
  id: number;
  asset_code: string;
  name: string;
  category: string;
  sub_category: string;
  status: string;
  location: string;
  owner_name: string;
  assigned_to: string;
  attributes?: any;
}

interface AssetDetailModalProps {
  asset: Asset;
  onClose: () => void;
}

export default function AssetDetailModal({ asset, onClose }: AssetDetailModalProps) {
  // Configurations tab only for Hardware and Virtual Infrastructure
  const showConfigTab = asset.category === 'hardware' || asset.category === 'virtual-infrastructure';

  // Set default tab based on category
  const defaultTab = showConfigTab ? 'config' : 'info';
  const [activeTab, setActiveTab] = useState<'info' | 'config' | 'changes'>(defaultTab);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Config management state
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [deletingConfig, setDeletingConfig] = useState<any>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);

  useEffect(() => {
    apiRequest(`/api/assets/${asset.id}`)
      .then(data => {
        setDetail(data.data || data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [asset.id]);

  const handleCreateConfig = () => {
    setEditingConfig(null);
    setShowConfigForm(true);
  };

  const handleEditConfig = (config: any) => {
    setEditingConfig(config);
    setShowConfigForm(true);
  };

  const handleDeleteConfig = (config: any) => {
    setDeletingConfig(config);
  };

  const handleConfigSaved = () => {
    setShowConfigForm(false);
    setEditingConfig(null);
  };

  const handleDeleteConfirm = async () => {
    setDeleteError(null);
    try {
      await apiRequest(`/api/configurations/${deletingConfig.id}`, { method: 'DELETE' });
      setDeletingConfig(null);
      setConfigRefreshKey(prev => prev + 1);
    } catch (error: any) {
      setDeleteError(error.message || 'Failed to delete configuration');
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      'users': 'USR',
      'hardware': 'HW',
      'software': 'SW',
      'virtual-infrastructure': 'VI',
      'information': 'INFO'
    };
    return icons[category] || 'AST';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg">
          <p className="text-gray-700 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {getCategoryIcon(asset.category)} {asset.name} ({asset.asset_code})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
            {/* Configurations tab - Only for Hardware and Virtual Infrastructure */}
            {showConfigTab && (
              <button
                onClick={() => setActiveTab('config')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'config'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Configurations
              </button>
            )}
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'info'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Asset Info
            </button>
            {/* Change History tab - Only for Hardware and Virtual Infrastructure */}
            {showConfigTab && (
              <button
                onClick={() => setActiveTab('changes')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'changes'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Change History
              </button>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === 'config' && (
            <>
              {showConfigForm ? (
                <ConfigForm
                  assetId={asset.id}
                  config={editingConfig}
                  onSubmit={handleConfigSaved}
                  onCancel={() => {
                    setShowConfigForm(false);
                    setEditingConfig(null);
                  }}
                />
              ) : deletingConfig ? (
                <DeleteConfirm
                  config={deletingConfig}
                  onConfirm={handleDeleteConfirm}
                  onCancel={() => setDeletingConfig(null)}
                  error={deleteError}
                />
              ) : (
                <ConfigList
                  assetId={asset.id}
                  onEdit={handleEditConfig}
                  onDelete={handleDeleteConfig}
                  onCreate={handleCreateConfig}
                  refreshKey={configRefreshKey}
                />
              )}
            </>
          )}

          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Asset Code
                  </label>
                  <p className="text-gray-900 dark:text-white font-mono">{asset.asset_code}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Category
                  </label>
                  <p className="text-gray-900 dark:text-white">
                    {getCategoryIcon(asset.category)} {asset.category}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Sub-Category
                  </label>
                  <p className="text-gray-900 dark:text-white">{asset.sub_category}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Status
                  </label>
                  <p className="text-gray-900 dark:text-white">{asset.status}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Location
                  </label>
                  <p className="text-gray-900 dark:text-white">{asset.location || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Owner
                  </label>
                  <p className="text-gray-900 dark:text-white">{asset.owner_name || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Assigned To
                  </label>
                  <p className="text-gray-900 dark:text-white">{asset.assigned_to || '-'}</p>
                </div>
              </div>

              {detail && detail.attributes && (
                <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Details</h3>
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {JSON.stringify(detail.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'changes' && (
            <ConfigHistory assetId={asset.id} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
