"use client";

interface AssetFiltersProps {
  search: string;
  category: string;
  subCategory: string;
  classification: string;
  status: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSubCategoryChange: (value: string) => void;
  onClassificationChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
}

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'users', label: 'Users' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'virtual-infrastructure', label: 'Virtual Infrastructure' },
  { value: 'information', label: 'Information' }
];

const SUB_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  'users': [
    { value: '', label: 'All Sub-Categories' },
    { value: 'team_member', label: 'Team Member' },
    { value: 'ftp_user', label: 'FTP User' },
    { value: 'samba_192', label: 'Samba 192' },
    { value: 'samba_sequis', label: 'Samba Sharing Sequis' },
    { value: 'sig_member', label: 'SIG Member' }
  ],
  'hardware': [
    { value: '', label: 'All Sub-Categories' },
    { value: 'server_rack', label: 'Server Rack' },
    { value: 'server_tower', label: 'Server Tower' },
    { value: 'kvm', label: 'KVM' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'disk_sas', label: 'Disk / SAS' },
    { value: 'tape_cassette', label: 'Tape Cassette' }
  ],
  'software': [
    { value: '', label: 'All Sub-Categories' },
    { value: 'os_license', label: 'OS License' },
    { value: 'application', label: 'Application' },
    { value: 'utility', label: 'Utility' },
    { value: 'freeware', label: 'Freeware' }
  ],
  'virtual-infrastructure': [
    { value: '', label: 'All Sub-Categories' },
    { value: 'virtual_machine', label: 'Virtual Machine' },
    { value: 'container', label: 'Container' },
    { value: 'cloud_instance', label: 'Cloud Instance' }
  ],
  'information': [
    { value: '', label: 'All Sub-Categories' },
    { value: 'database', label: 'Database' },
    { value: 'document', label: 'Document' },
    { value: 'record', label: 'Record' },
    { value: 'archive', label: 'Archive' }
  ]
};

const CLASSIFICATIONS = [
  { value: '', label: 'All Classifications' },
  { value: 'public', label: 'Public' },
  { value: 'internal', label: 'Internal' },
  { value: 'confidential', label: 'Confidential' }
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'in-maintenance', label: 'In Maintenance' },
  { value: 'retired', label: 'Retired' },
  { value: 'lost', label: 'Lost' }
];

export default function AssetFilters({
  search,
  category,
  subCategory,
  classification,
  status,
  onSearchChange,
  onCategoryChange,
  onSubCategoryChange,
  onClassificationChange,
  onStatusChange,
  onReset,
}: AssetFiltersProps) {
  const currentSubCategories = category ? SUB_CATEGORIES[category] || [] : [];

  return (
    <div className="mb-6 p-4 rounded-lg bg-white dark:bg-slate-800 shadow">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Search
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, asset code, owner..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              onSubCategoryChange(''); // Reset sub-category when category changes
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        {/* Sub-Category */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Sub-Category
          </label>
          <select
            value={subCategory}
            onChange={(e) => onSubCategoryChange(e.target.value)}
            disabled={!category}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentSubCategories.map(sub => (
              <option key={sub.value} value={sub.value}>{sub.label}</option>
            ))}
          </select>
        </div>

        {/* Classification */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Classification
          </label>
          <select
            value={classification}
            onChange={(e) => onClassificationChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {CLASSIFICATIONS.map(classification => (
              <option key={classification.value} value={classification.value}>
                {classification.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {STATUSES.map(status => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-end gap-2">
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Reset all filters"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
