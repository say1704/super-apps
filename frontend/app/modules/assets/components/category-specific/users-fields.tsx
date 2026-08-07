/**
 * Users Category Fields Component
 * LOCKED - DO NOT MODIFY without approval
 * 
 * Sub-categories: team_member, ftp_user, samba_192, samba_sequis, sig_member
 */

"use client";

import PasswordField from '../password-field';

interface UsersFieldsProps {
  subCategory: string;
  attributes: Record<string, any>;
  onAttributeChange: (key: string, value: string) => void;
  isEdit?: boolean;
  assetId?: number;
}

export default function UsersFields({
  subCategory,
  attributes,
  onAttributeChange,
  isEdit = false,
  assetId
}: UsersFieldsProps) {

  switch (subCategory) {
    // ==================== TEAM MEMBER ====================
    case 'team_member':
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">No. Telp *</label>
            <input
              type="text"
              value={attributes.phone || ''}
              onChange={(e) => onAttributeChange('phone', e.target.value)}
              required
              placeholder="e.g., 081234567890"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              value={attributes.email || ''}
              onChange={(e) => onAttributeChange('email', e.target.value)}
              placeholder="e.g., john@company.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Department</label>
            <input
              type="text"
              value={attributes.department || ''}
              onChange={(e) => onAttributeChange('department', e.target.value)}
              placeholder="e.g., IT Department"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    // ==================== FTP USER ====================
    case 'ftp_user':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">FTP Users *</label>
              <input
                type="text"
                value={attributes.username || ''}
                onChange={(e) => onAttributeChange('username', e.target.value)}
                required
                placeholder="e.g., ftp_user01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Kategori</label>
              <input
                type="text"
                value={attributes.category || ''}
                onChange={(e) => onAttributeChange('category', e.target.value)}
                placeholder="e.g., internal, external, vendor"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">FTP Password *</label>
              <PasswordField
                label=""
                value={attributes.password || ''}
                onChange={(value) => onAttributeChange('password', value)}
                required={!isEdit}
                showMasked={isEdit}
                assetId={assetId}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tanggal Pembuatan</label>
              <input
                type="date"
                value={attributes.created_date || ''}
                onChange={(e) => onAttributeChange('created_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Pemohon *</label>
              <input
                type="text"
                value={attributes.requester || ''}
                onChange={(e) => onAttributeChange('requester', e.target.value)}
                required
                placeholder="e.g., John Doe"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Catatan</label>
            <textarea
              value={attributes.notes || ''}
              onChange={(e) => onAttributeChange('notes', e.target.value)}
              rows={3}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    // ==================== SAMBA 192 ====================
    case 'samba_192':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Username *</label>
              <input
                type="text"
                value={attributes.username || ''}
                onChange={(e) => onAttributeChange('username', e.target.value)}
                required
                placeholder="e.g., admin_share"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Group Name *</label>
              <input
                type="text"
                value={attributes.group_name || ''}
                onChange={(e) => onAttributeChange('group_name', e.target.value)}
                required
                placeholder="e.g., administrators"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      );

    // ==================== SAMBA SEQUIS ====================
    case 'samba_sequis':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Username *</label>
              <input
                type="text"
                value={attributes.username || ''}
                onChange={(e) => onAttributeChange('username', e.target.value)}
                required
                placeholder="e.g., vendor_access"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Group Name</label>
              <input
                type="text"
                value={attributes.group_name || ''}
                onChange={(e) => onAttributeChange('group_name', e.target.value)}
                placeholder="e.g., external_vendors"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <PasswordField
                label="Password *"
                value={attributes.password || ''}
                onChange={(value) => onAttributeChange('password', value)}
                required={!isEdit}
                showMasked={isEdit}
                assetId={assetId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Permission Level *</label>
              <select
                value={attributes.permission_level || 'Read Only'}
                onChange={(e) => onAttributeChange('permission_level', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Read Only">Read Only</option>
                <option value="Read/Write">Read/Write</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Account Status *</label>
              <select
                value={attributes.account_status || 'Active'}
                onChange={(e) => onAttributeChange('account_status', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Active">Active</option>
                <option value="Disabled">Disabled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Created Date</label>
              <input
                type="date"
                value={attributes.created_date || ''}
                onChange={(e) => onAttributeChange('created_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              value={attributes.email || ''}
              onChange={(e) => onAttributeChange('email', e.target.value)}
              placeholder="e.g., user@example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Comments</label>
            <textarea
              value={attributes.comments || ''}
              onChange={(e) => onAttributeChange('comments', e.target.value)}
              rows={3}
              placeholder="Comments/catatan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    // ==================== SIG MEMBER ====================
    case 'sig_member':
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nama Kelompok Kepentingan *</label>
            <input
              type="text"
              value={attributes.group_name || ''}
              onChange={(e) => onAttributeChange('group_name', e.target.value)}
              required
              placeholder="e.g., SIG Security Awareness"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Jenis Kepentingan Terkait Keamanan Informasi *</label>
            <textarea
              value={attributes.interest_type || ''}
              onChange={(e) => onAttributeChange('interest_type', e.target.value)}
              required
              rows={3}
              placeholder="e.g., Keamanan Informasi, Awareness, Training"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Pihak Internal yang Bertanggung Jawab *</label>
              <input
                type="text"
                value={attributes.responsible_party || ''}
                onChange={(e) => onAttributeChange('responsible_party', e.target.value)}
                required
                placeholder="e.g., IT Security Team"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Mekanisme Komunikasi *</label>
              <select
                value={attributes.communication_mechanism || 'Email'}
                onChange={(e) => onAttributeChange('communication_mechanism', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Slack">Slack</option>
                <option value="Teams">Microsoft Teams</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Informasi/Data yang Dibagikan (Jika Ada)</label>
            <textarea
              value={attributes.shared_data || ''}
              onChange={(e) => onAttributeChange('shared_data', e.target.value)}
              rows={3}
              placeholder="e.g., Dokumen policy, training material, incident reports"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Detail Kontak</label>
            <input
              type="text"
              value={attributes.contact_detail || ''}
              onChange={(e) => onAttributeChange('contact_detail', e.target.value)}
              placeholder="e.g., security-sig@company.com / +62 812-3456-7890"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
