/**
 * Software Category Fields Component
 *
 * Based on Excel columns:
 * - Software Name
 * - Version
 * - License
 * - Main Function
 * - Department
 * - Status
 * - Notes
 */

"use client";

interface SoftwareFieldsProps {
  subCategory: string;
  attributes: Record<string, any>;
  onAttributeChange: (key: string, value: string) => void;
}

export default function SoftwareFields({
  subCategory,
  attributes,
  onAttributeChange
}: SoftwareFieldsProps) {

  // Common fields for all software types (from Excel)
  const commonFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Version</label>
          <input
            type="text"
            value={attributes.version || ''}
            onChange={(e) => onAttributeChange('version', e.target.value)}
            placeholder="e.g., 2022, 15.0.1, 3.2.1"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">License</label>
          <select
            value={attributes.license || 'perpetual'}
            onChange={(e) => onAttributeChange('license', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="perpetual">Perpetual (One-time)</option>
            <option value="subscription">Subscription (Annual/Monthly)</option>
            <option value="volume">Volume License</option>
            <option value="oem">OEM</option>
            <option value="freeware">Freeware</option>
            <option value="open-source">Open Source</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Main Function</label>
        <textarea
          value={attributes.main_function || ''}
          onChange={(e) => onAttributeChange('main_function', e.target.value)}
          placeholder="e.g., Office productivity, Graphic design, Database management"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Department</label>
          <select
            value={attributes.department || ''}
            onChange={(e) => onAttributeChange('department', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="it">IT / Sysadmin</option>
            <option value="network">Network Team</option>
            <option value="security">Security Team</option>
            <option value="database">Database Team</option>
            <option value="helpdesk">Helpdesk / Support</option>
            <option value="hr">HR & General</option>
            <option value="finance">Finance & Accounting</option>
            <option value="operations">Operations</option>
            <option value="sales">Sales & Marketing</option>
            <option value="production">Production</option>
            <option value="procurement">Procurement / Purchasing</option>
            <option value="legal">Legal</option>
            <option value="management">Management</option>
            <option value="all">All Divisions</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Vendor/Publisher</label>
          <input
            type="text"
            value={attributes.vendor || ''}
            onChange={(e) => onAttributeChange('vendor', e.target.value)}
            placeholder="e.g., Microsoft, Adobe, Oracle"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">License Key (Optional)</label>
          <input
            type="text"
            value={attributes.license_key || ''}
            onChange={(e) => onAttributeChange('license_key', e.target.value)}
            placeholder="e.g., XXXXX-XXXXX-XXXXX-XXXXX"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Number of Licenses</label>
          <input
            type="number"
            value={attributes.license_count || ''}
            onChange={(e) => onAttributeChange('license_count', e.target.value)}
            placeholder="e.g., 10"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </>
  );

  switch (subCategory) {
    case 'os_license':
      return (
        <div className="space-y-4">
          {commonFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Operating System</label>
            <input
              type="text"
              value={attributes.os_name || ''}
              onChange={(e) => onAttributeChange('os_name', e.target.value)}
              placeholder="e.g., Windows Server 2022, RHEL 9, Ubuntu 22.04 LTS"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              value={attributes.notes || ''}
              onChange={(e) => onAttributeChange('notes', e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'application':
      return (
        <div className="space-y-4">
          {commonFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              value={attributes.notes || ''}
              onChange={(e) => onAttributeChange('notes', e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'utility':
      return (
        <div className="space-y-4">
          {commonFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Utility Type</label>
            <select
              value={attributes.utility_type || ''}
              onChange={(e) => onAttributeChange('utility_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              <option value="antivirus">Antivirus/Antimalware</option>
              <option value="backup">Backup & Recovery</option>
              <option value="monitoring">Monitoring</option>
              <option value="compression">Compression</option>
              <option value="disk-management">Disk Management</option>
              <option value="system-utility">System Utility</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              value={attributes.notes || ''}
              onChange={(e) => onAttributeChange('notes', e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'freeware':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Version</label>
              <input
                type="text"
                value={attributes.version || ''}
                onChange={(e) => onAttributeChange('version', e.target.value)}
                placeholder="e.g., 3.2.1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Publisher</label>
              <input
                type="text"
                value={attributes.vendor || ''}
                onChange={(e) => onAttributeChange('vendor', e.target.value)}
                placeholder="e.g., Open Source Community"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Main Function</label>
            <textarea
              value={attributes.main_function || ''}
              onChange={(e) => onAttributeChange('main_function', e.target.value)}
              placeholder="e.g., Free office suite, Image editor"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Download URL</label>
            <input
              type="url"
              value={attributes.download_url || ''}
              onChange={(e) => onAttributeChange('download_url', e.target.value)}
              placeholder="e.g., https://example.com/download"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Notes</label>
            <textarea
              value={attributes.notes || ''}
              onChange={(e) => onAttributeChange('notes', e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
