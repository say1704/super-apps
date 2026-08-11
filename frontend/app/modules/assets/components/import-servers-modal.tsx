"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/auth';

interface CandidateGroup {
  source: string;
  source_label: string;
  category: string;
  sub_category: string;
  items: CandidateItem[];
}

interface CandidateItem {
  name: string;
  source: string;
  source_label: string;
  category: string;
  sub_category: string;
  exists: boolean;
  attributes: Record<string, string>;
  keterangan: string;
}

interface ImportServersModalProps {
  onClose: () => void;
  onImported: () => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  hardware: 'Hardware',
  'virtual-infrastructure': 'Virtual Infrastructure',
};

export default function ImportServersModal({ onClose, onImported }: ImportServersModalProps) {
  const [groups, setGroups] = useState<CandidateGroup[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [existingCount, setExistingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const result = await apiRequest('/api/assets/import-candidates');
      setGroups(result.groups || []);
      setNewCount(result.new_count || 0);
      setExistingCount(result.existing_count || 0);
      setSelected(new Set(
        (result.groups || []).flatMap((g: CandidateGroup) =>
          g.items.filter((i: CandidateItem) => !i.exists).map((i: CandidateItem) => `${i.category}|${i.name}`)
        )
      ));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    const selections = Array.from(selected).map(key => {
      const [category, ...nameParts] = key.split('|');
      return { name: nameParts.join('|'), category };
    });
    if (selections.length === 0) return;
    setImporting(true);
    try {
      const result = await apiRequest('/api/assets/import-from-servers', {
        method: 'POST',
        body: JSON.stringify({ selections }),
      });
      alert(`${result.message}\nImported: ${(result.imported || []).length}\nSkipped: ${(result.skipped || []).length}`);
      onImported();
      onClose();
    } catch (err) {
      alert((err as { message?: string })?.message || 'Gagal mengimpor aset');
    } finally {
      setImporting(false);
    }
  };

  const attrHint = (item: CandidateItem) => {
    const parts: string[] = [];
    if (item.attributes.ip_address) parts.push(`IP: ${item.attributes.ip_address}`);
    if (item.attributes.os) parts.push(`OS: ${item.attributes.os}`);
    if (item.attributes.cpu) parts.push(`CPU: ${item.attributes.cpu}`);
    if (item.attributes.ram) parts.push(`RAM: ${item.attributes.ram}`);
    if (item.attributes.hypervisor) parts.push(`Hypervisor: ${item.attributes.hypervisor}`);
    if (item.attributes.storage) parts.push(`Storage: ${item.attributes.storage}`);
    return parts.join('  •  ');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-600">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Impor Aset dari Server</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                iRMC Check → Hardware (server_rack) • Backup/SAR/SSH → Virtual Infrastructure (virtual_machine)
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
            >
              Close
            </button>
          </div>
          <div className="flex gap-3 mt-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">{newCount} baru</span>
            <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 font-medium">{existingCount} sudah ada</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center py-16 text-gray-500">Memuat calon aset...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-gray-700 dark:text-gray-300 font-medium">Belum ada sumber server</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Lakukan scan iRMC/Backup/SAR/SSH terlebih dahulu</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.source}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-white">{group.source_label}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                    {CATEGORY_LABEL[group.category] || group.category} • {group.sub_category}
                  </span>
                </div>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-600">
                  {group.items.map(item => {
                    const key = `${item.category}|${item.name}`;
                    const checked = selected.has(key);
                    return (
                      <label key={key} className={`flex items-start gap-3 px-4 py-3 ${item.exists ? 'bg-gray-50 dark:bg-slate-800 opacity-60' : 'hover:bg-blue-50 dark:hover:bg-slate-700/50 cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4"
                          checked={checked}
                          disabled={item.exists}
                          onChange={() => toggle(key)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                            {item.exists ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">Sudah ada</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Baru</span>
                            )}
                          </div>
                          {attrHint(item) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{attrHint(item)}</div>
                          )}
                          {item.keterangan && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{item.keterangan}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-600 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {importing ? 'Mengimpor...' : `Import ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}