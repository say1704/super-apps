"use client";

import { apiRequest } from "@/lib/auth";


import { useEffect, useState } from 'react';

interface ConfigItem {
  id: number;
  asset_id: number;
  parameter: string;
  value: string;
  category: string;
  category_id: number | null;
  notes: string;
  last_checked: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface ConfigListProps {
  assetId: number;
  onEdit: (config: ConfigItem) => void;
  onDelete: (config: ConfigItem) => void;
  onCreate: () => void;
  refreshKey?: number;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

const colorMap: Record<string, string> = {
  red: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
  blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  green: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
  orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
};

export default function ConfigList({ assetId, onEdit, onDelete, onCreate, refreshKey = 0 }: ConfigListProps) {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => {
    fetchConfigs();
    fetchCategories();
  }, [assetId, refreshKey]);

  const fetchConfigs = async () => {
    setError(null);
    try {
      const data = await apiRequest(`/api/configurations/assets/${assetId}`);
      setConfigs(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await apiRequest('/api/config-categories');
      setCategories(data.data || []);
    } catch (err) { /* ignore */ }
  };

  let filtered = configs;
  if (catFilter) filtered = filtered.filter(c => c.category === catFilter);
  if (filter) {
    const f = filter.toLowerCase();
    filtered = filtered.filter(c =>
      c.parameter.toLowerCase().includes(f) ||
      c.value.toLowerCase().includes(f)
    );
  }

  if (loading) return <div className="p-4 text-gray-500 dark:text-gray-400">Loading configurations...</div>;

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button onClick={fetchConfigs} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Configurations</h3>
        <button onClick={onCreate} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          + Add Configuration
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <input type="text" placeholder="Search..." value={filter} onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded-lg">
          No configurations found. Click "Add Configuration" to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(cfg => {
            const cat = categories.find(c => c.id === cfg.category_id);
            const badgeClass = cat
              ? (colorMap[cat.color] || colorMap.blue)
              : (colorMap[cfg.category?.toLowerCase()] || colorMap.blue);
            return (
              <div key={cfg.id}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{cfg.parameter}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                        {cfg.category || 'Uncategorized'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-mono">{cfg.value}</div>
                    {cfg.notes && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Note: {cfg.notes}</div>}
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Last checked: {cfg.last_checked ? new Date(cfg.last_checked).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => onEdit(cfg)}
                      className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm" title="Edit">Edit</button>
                    <button onClick={() => onDelete(cfg)}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm" title="Delete">Del</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
