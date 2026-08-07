"use client";

import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/auth';
import PasswordField from './password-field';
import UsersFields from './category-specific/users-fields';
import HardwareFields from './category-specific/hardware-fields';
import SoftwareFields from './category-specific/software-fields';
import VirtualInfrastructureFields from './category-specific/virtual-infra-fields';
import InformationFields from './category-specific/information-fields';

interface AssetFormProps {
  asset?: any;
  category: string;
  subCategory: string;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// Builtin sub-categories for validation fallback
const BUILTIN_SUB_CATEGORIES: Record<string, string[]> = {
  'users': ['team_member', 'ftp_user', 'samba_192', 'samba_sequis', 'sig_member'],
  'hardware': [
    'server_rack', 'server_tower', 'kvm', 'laptop', 'disk_sas', 'tape_cassette'
  ],
  'software': ['os_license', 'application', 'utility', 'freeware'],
  'virtual-infrastructure': ['virtual_machine', 'container', 'cloud_instance'],
  'information': ['database', 'document', 'record', 'archive']
};

const ALLOW_CUSTOM_SUB_CATEGORY = ['hardware'];

const AUTO_CLASSIFICATION: Record<string, Record<string, string>> = {
  'users': {
    'team_member': 'internal',
    'ftp_user': 'confidential',
    'samba_192': 'confidential',
    'samba_sequis': 'confidential',
    'sig_member': 'internal'
  },
  'hardware': { 'default': 'internal' },
  'software': { 'default': 'internal' },
  'virtual-infrastructure': { 'default': 'internal' },
  'information': {
    'database': 'confidential',
    'record': 'confidential',
    'document': 'internal',
    'archive': 'internal'
  }
};

export default function AssetForm({
  asset,
  category,
  subCategory,
  onSubmit,
  onCancel,
  isLoading = false
}: AssetFormProps) {
  const [metadata, setMetadata] = useState({
    categories: [] as string[],
    subCategories: {} as Record<string, string[]>,
    classifications: [] as string[],
    statuses: [] as string[],
  });
  const [metadataLoading, setMetadataLoading] = useState(true);

  useEffect(() => {
    apiRequest('/api/v1/asset-metadata/all')
      .then((data: any) => {
        if (data.categories && data.categories.length > 0) {
          setMetadata({
            categories: [...new Set<string>(data.categories?.map((c: any) => c.name) || [])],
            subCategories: (data.sub_categories || []).reduce((acc: any, sc: any) => {
              const catName = data.categories?.find((c: any) => c.id === sc.category_id)?.name;
              if (catName) {
                if (!acc[catName]) acc[catName] = [];
                if (!acc[catName].includes(sc.name)) acc[catName].push(sc.name);
              }
              return acc;
            }, {} as Record<string, string[]>),
            classifications: [...new Set<string>(data.classifications?.map((c: any) => c.name) || [])],
            statuses: [...new Set<string>(data.statuses?.map((s: any) => s.name) || [])],
          });
        } else {
          throw new Error('No metadata available');
        }
      })
      .catch(() => {
        setMetadata({
          categories: ['users', 'hardware', 'software', 'virtual-infrastructure', 'information'],
          subCategories: BUILTIN_SUB_CATEGORIES,
          classifications: ['public', 'internal', 'confidential'],
          statuses: ['active', 'in-maintenance', 'retired', 'lost'],
        });
      })
      .finally(() => setMetadataLoading(false));
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    category: 'users',
    sub_category: 'team_member',
    classification: 'internal',
    owner_name: '',
    assigned_to: '',
    location: '',
    status: 'active',
    purchase_date: '',
    warranty_until: '',
    price: '',
    acceptable_use_policy: '',
    attributes: {} as any
  });

  // Load asset data when editing
  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || '',
        category: asset.category || 'users',
        sub_category: asset.sub_category || 'team_member',
        classification: asset.classification || 'internal',
        owner_name: asset.owner_name || '',
        assigned_to: asset.assigned_to || '',
        location: asset.location || '',
        status: asset.status || 'active',
        purchase_date: asset.purchase_date || '',
        warranty_until: asset.warranty_until || '',
        price: asset.price || '',
        acceptable_use_policy: asset.acceptable_use_policy || '',
        attributes: asset.attributes || {}
      });
    }
  }, [asset]);

  // Auto-set classification when category/sub-category changes
  useEffect(() => {
    if (category && subCategory) {
      const classConfig = AUTO_CLASSIFICATION[category];
      if (classConfig) {
        const newClassification = classConfig[subCategory] || classConfig['default'] || 'internal';
        setFormData(prev => ({ ...prev, classification: newClassification }));
      }
    }
  }, [category, subCategory]);

  const handleAttributeChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate name for ftp_user, samba_192, samba_sequis, and sig_member from username/group_name
    if ((formData.sub_category === 'ftp_user' || formData.sub_category === 'samba_192' || formData.sub_category === 'samba_sequis' || formData.sub_category === 'sig_member') && !formData.name) {
      let identifier = '';
      let prefix = '';
      
      if (formData.sub_category === 'ftp_user') {
        identifier = formData.attributes?.username || 'ftp_user';
        prefix = 'FTP User';
      } else if (formData.sub_category === 'samba_192') {
        identifier = formData.attributes?.username || 'samba192';
        prefix = 'Samba 192';
      } else if (formData.sub_category === 'samba_sequis') {
        identifier = formData.attributes?.username || 'samba';
        prefix = 'Samba Sequis';
      } else {
        identifier = formData.attributes?.group_name || 'sig';
        prefix = 'SIG';
      }
      
      formData.name = `${prefix} - ${identifier}`;
    }
    
    onSubmit(formData);
  };

  // Render category-specific fields using dedicated components
  const renderCategoryFields = () => {
    const attrs = formData.attributes || {};
    const isEdit = !!asset;

    switch (formData.category) {
      case 'users':
        return (
          <UsersFields
            subCategory={formData.sub_category}
            attributes={attrs}
            onAttributeChange={handleAttributeChange}
            isEdit={isEdit}
            assetId={asset?.id}
          />
        );
      case 'hardware':
        return (
          <HardwareFields
            subCategory={formData.sub_category}
            attributes={attrs}
            onAttributeChange={handleAttributeChange}
          />
        );
      case 'software':
        return (
          <SoftwareFields
            subCategory={formData.sub_category}
            attributes={attrs}
            onAttributeChange={handleAttributeChange}
          />
        );
      case 'virtual-infrastructure':
        return (
          <VirtualInfrastructureFields
            subCategory={formData.sub_category}
            attributes={attrs}
            onAttributeChange={handleAttributeChange}
          />
        );
      case 'information':
        return (
          <InformationFields
            subCategory={formData.sub_category}
            attributes={attrs}
            onAttributeChange={handleAttributeChange}
          />
        );
      default:
        return null;
    }
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
          Basic Information
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Asset Code
            </label>
            <input
              type="text"
              value={asset?.asset_code || 'Auto-generated'}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-500 dark:text-gray-400"
            />
          </div>
          {(formData.sub_category !== 'samba_192' && formData.sub_category !== 'samba_sequis' && formData.sub_category !== 'sig_member' && formData.sub_category !== 'ftp_user') && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required={formData.sub_category !== 'samba_192' && formData.sub_category !== 'samba_sequis' && formData.sub_category !== 'sig_member' && formData.sub_category !== 'ftp_user'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => {
              const newCategory = e.target.value;
              const firstSub = metadata.subCategories[newCategory]?.[0] || '';
              setFormData({ ...formData, category: newCategory, sub_category: firstSub });
            }}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {metadata.categories.map(cat => (
                <option key={cat} value={cat}>{cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Sub-Category *
            </label>
            <select
              value={formData.sub_category && !metadata.subCategories[formData.category]?.includes(formData.sub_category) ? 'custom' : formData.sub_category}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setFormData({ ...formData, sub_category: '' });
                } else {
                  setFormData({ ...formData, sub_category: e.target.value });
                }
              }}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {metadata.subCategories[formData.category]?.map(sub => (
                <option key={sub} value={sub}>
                  {formData.category === 'hardware' ? (
                    sub === 'server_rack' ? 'Server Rack' :
                    sub === 'server_tower' ? 'Server Tower' :
                    sub === 'kvm' ? 'KVM' :
                    sub === 'laptop' ? 'Laptop' :
                    sub === 'disk_sas' ? 'Disk / SAS' :
                    sub === 'tape_cassette' ? 'Tape Cassette' :
                    sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  ) : (
                    sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  )}
                </option>
              ))}
              {ALLOW_CUSTOM_SUB_CATEGORY.includes(formData.category) && (
                <option value="custom">Add Custom...</option>
              )}
            </select>
            
            {/* Custom sub-category input */}
            {ALLOW_CUSTOM_SUB_CATEGORY.includes(formData.category) && (
              <input
                type="text"
                value={formData.sub_category}
                onChange={(e) => {
                  const normalized = e.target.value.toLowerCase().replace(/[\s-]+/g, '_');
                  setFormData({ ...formData, sub_category: normalized });
                }}
                placeholder={formData.sub_category === '' ? "e.g., network_switch, ups, pdu" : ""}
                className={`mt-2 w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  formData.sub_category && !metadata.subCategories[formData.category]?.includes(formData.sub_category)
                    ? 'border-blue-500 dark:border-blue-400'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Classification *
            </label>
            <select
              value={formData.classification}
              onChange={(e) => setFormData({ ...formData, classification: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {metadata.classifications.map(cls => (
                <option key={cls} value={cls}>{cls.charAt(0).toUpperCase() + cls.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {metadata.statuses.map(st => (
                <option key={st} value={st}>{st.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ownership & Assignment */}
      {formData.sub_category !== 'team_member' && formData.sub_category !== 'ftp_user' && formData.sub_category !== 'samba_192' && formData.sub_category !== 'samba_sequis' && formData.sub_category !== 'sig_member' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            Ownership & Assignment
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Owner *
              </label>
              <input
                type="text"
                value={formData.owner_name}
                onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                required
                placeholder="e.g., Admin"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Assigned To
              </label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                placeholder="e.g., John Doe"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Data Center, Rack A1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Category-Specific Fields */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
          {formData.sub_category === 'team_member' ? 'Team Member Details' : 
           formData.sub_category === 'ftp_user' ? 'FTP User Details' :
           formData.sub_category === 'samba_192' ? 'Samba 192 Details' :
           formData.sub_category === 'samba_sequis' ? 'Samba Sharing Sequis Details' :
           formData.sub_category === 'sig_member' ? 'SIG Member Details' :
           `${formData.sub_category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Details`}
        </h3>
        {renderCategoryFields()}
      </div>

      {/* Lifecycle - Only for non-user sub-categories */}
      {formData.sub_category !== 'team_member' && formData.sub_category !== 'ftp_user' && formData.sub_category !== 'samba_192' && formData.sub_category !== 'samba_sequis' && formData.sub_category !== 'sig_member' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            Lifecycle (Optional)
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Purchase Date
              </label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Warranty Until
              </label>
              <input
                type="date"
                value={formData.warranty_until}
                onChange={(e) => setFormData({ ...formData, warranty_until: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Price
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes - Only for non-user sub-categories */}
      {formData.sub_category !== 'team_member' && formData.sub_category !== 'ftp_user' && formData.sub_category !== 'samba_192' && formData.sub_category !== 'samba_sequis' && formData.sub_category !== 'sig_member' && (
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
            Acceptable Use Policy / Notes
          </label>
          <textarea
            value={formData.acceptable_use_policy}
            onChange={(e) => setFormData({ ...formData, acceptable_use_policy: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : (asset ? 'Update' : 'Create')} Asset
        </button>
      </div>
    </form>
  );
}
