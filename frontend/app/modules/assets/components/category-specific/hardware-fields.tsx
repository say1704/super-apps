/**
 * Hardware Category Fields Component
 * 
 * Sub-categories: laptop, desktop, server, network_device, printer, other
 * 
 * Based on Excel columns:
 * - Device Type (sub_category)
 * - Model Name
 * - Device Name (name - from main form)
 * - Serial Number
 * - Asset Number (asset_code - auto-generated)
 * - Location (from main form)
 * - Status (from main form)
 * - Keterangan
 */

"use client";

interface HardwareFieldsProps {
  subCategory: string;
  attributes: Record<string, any>;
  onAttributeChange: (key: string, value: string) => void;
}

export default function HardwareFields({
  subCategory,
  attributes,
  onAttributeChange
}: HardwareFieldsProps) {

  // Common fields for all hardware types
  const commonFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Serial Number</label>
          <input
            type="text"
            value={attributes.serial_number || ''}
            onChange={(e) => onAttributeChange('serial_number', e.target.value)}
            placeholder="e.g., SN-123456789"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Model Name</label>
          <input
            type="text"
            value={attributes.model || ''}
            onChange={(e) => onAttributeChange('model', e.target.value)}
            placeholder="e.g., Latitude 5520, PowerEdge R740"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Manufacturer</label>
          <input
            type="text"
            value={attributes.manufacturer || ''}
            onChange={(e) => onAttributeChange('manufacturer', e.target.value)}
            placeholder="e.g., Dell, HP, Cisco, Fujitsu"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">IP Address *</label>
          <input
            type="text"
            value={attributes.ip_address || ''}
            onChange={(e) => onAttributeChange('ip_address', e.target.value)}
            placeholder="e.g., 192.168.1.100"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            required
          />
        </div>
      </div>
    </>
  );

  // Server-specific fields
  const serverFields = (
    <>
      {commonFields}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Virtualization</label>
          <select
            value={attributes.virtualization || 'no'}
            onChange={(e) => onAttributeChange('virtualization', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Hypervisor</label>
          <select
            value={attributes.hypervisor || ''}
            onChange={(e) => onAttributeChange('hypervisor', e.target.value)}
            disabled={attributes.virtualization === 'no'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="vmware">VMware vSphere/ESXi</option>
            <option value="proxmox">Proxmox VE</option>
            <option value="hyper-v">Microsoft Hyper-V</option>
            <option value="kvm">KVM</option>
            <option value="xen">Xen</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">CPU / vCPU</label>
          <input
            type="text"
            value={attributes.cpu || ''}
            onChange={(e) => onAttributeChange('cpu', e.target.value)}
            placeholder="e.g., 2x Intel Xeon 8-Core"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">RAM</label>
          <input
            type="text"
            value={attributes.ram || ''}
            onChange={(e) => onAttributeChange('ram', e.target.value)}
            placeholder="e.g., 128 GB DDR4"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage</label>
          <input
            type="text"
            value={attributes.storage || ''}
            onChange={(e) => onAttributeChange('storage', e.target.value)}
            placeholder="e.g., 4x 2TB SSD RAID10"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </>
  );

  // Network device-specific fields
  const networkDeviceFields = (
    <>
      {commonFields}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Device Type</label>
          <select
            value={attributes.device_type || 'switch'}
            onChange={(e) => onAttributeChange('device_type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="switch">Switch</option>
            <option value="router">Router</option>
            <option value="firewall">Firewall</option>
            <option value="access-point">Access Point</option>
            <option value="load-balancer">Load Balancer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Port Count (Optional)</label>
          <input
            type="text"
            value={attributes.port_count || ''}
            onChange={(e) => onAttributeChange('port_count', e.target.value)}
            placeholder="e.g., 24 ports, 48 ports"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Firmware Version</label>
        <input
          type="text"
          value={attributes.firmware_version || ''}
          onChange={(e) => onAttributeChange('firmware_version', e.target.value)}
          placeholder="e.g., 15.2(7)E3"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </>
  );

  // Printer-specific fields
  const printerFields = (
    <>
      {commonFields}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Printer Type</label>
          <select
            value={attributes.printer_type || 'laser'}
            onChange={(e) => onAttributeChange('printer_type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="laser">Laser</option>
            <option value="inkjet">Inkjet</option>
            <option value="dot-matrix">Dot Matrix</option>
            <option value="multifunction">Multifunction (MFP)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Color Support</label>
          <select
            value={attributes.color_support || 'monochrome'}
            onChange={(e) => onAttributeChange('color_support', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="monochrome">Monochrome (B/W)</option>
            <option value="color">Color</option>
          </select>
        </div>
      </div>
    </>
  );

  // Laptop/Desktop-specific fields
  const workstationFields = (
    <>
      {commonFields}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">CPU</label>
          <input
            type="text"
            value={attributes.cpu || ''}
            onChange={(e) => onAttributeChange('cpu', e.target.value)}
            placeholder="e.g., Intel i7-1165G7"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">RAM</label>
          <input
            type="text"
            value={attributes.ram || ''}
            onChange={(e) => onAttributeChange('ram', e.target.value)}
            placeholder="e.g., 16 GB"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage</label>
          <input
            type="text"
            value={attributes.storage || ''}
            onChange={(e) => onAttributeChange('storage', e.target.value)}
            placeholder="e.g., 512 GB SSD"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </>
  );

  // Render based on sub-category
  switch (subCategory) {
    case 'laptop':
    case 'desktop':
      return (
        <div className="space-y-4">
          {workstationFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'server':
      return (
        <div className="space-y-4">
          {serverFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'network_device':
      return (
        <div className="space-y-4">
          {networkDeviceFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'printer':
      return (
        <div className="space-y-4">
          {printerFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'other':
      return (
        <div className="space-y-4">
          {commonFields}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={3}
              placeholder="Deskripsi dan catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    // ==================== NEW SUB-CATEGORIES (Excel Based) ====================
    case 'server_rack':
    case 'server_tower':
      return (
        <div className="space-y-4">
          {serverFields}
          <div className="grid grid-cols-2 gap-4">
            {subCategory === 'server_rack' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Rack Units (RU)</label>
                  <input
                    type="text"
                    value={attributes.rack_units || ''}
                    onChange={(e) => onAttributeChange('rack_units', e.target.value)}
                    placeholder="e.g., 42U, 24U"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Rack Position</label>
                  <input
                    type="text"
                    value={attributes.rack_position || ''}
                    onChange={(e) => onAttributeChange('rack_position', e.target.value)}
                    placeholder="e.g., Rack A, Row 3"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'kvm':
      return (
        <div className="space-y-4">
          {commonFields}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">KVM Type</label>
              <select
                value={attributes.kvm_type || 'analog'}
                onChange={(e) => onAttributeChange('kvm_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="analog">Analog KVM</option>
                <option value="ip">IP KVM</option>
                <option value="matrix">Matrix KVM</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Port Count</label>
              <input
                type="text"
                value={attributes.port_count || ''}
                onChange={(e) => onAttributeChange('port_count', e.target.value)}
                placeholder="e.g., 8 ports, 16 ports, 32 ports"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {subCategory === 'kvm' && attributes.kvm_type === 'ip' && (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">IP Address</label>
              <input
                type="text"
                value={attributes.ip_address || ''}
                onChange={(e) => onAttributeChange('ip_address', e.target.value)}
                placeholder="e.g., 192.168.1.100"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'disk_sas':
      return (
        <div className="space-y-4">
          {commonFields}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Capacity</label>
              <input
                type="text"
                value={attributes.capacity || ''}
                onChange={(e) => onAttributeChange('capacity', e.target.value)}
                placeholder="e.g., 2TB, 4TB, 8TB"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">RPM</label>
              <select
                value={attributes.rpm || ''}
                onChange={(e) => onAttributeChange('rpm', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="7200">7200 RPM</option>
                <option value="10000">10000 RPM</option>
                <option value="15000">15000 RPM</option>
                <option value="ssd">SSD (No RPM)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Interface</label>
              <select
                value={attributes.interface || ''}
                onChange={(e) => onAttributeChange('interface', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="sas">SAS</option>
                <option value="sata">SATA</option>
                <option value="nvme">NVMe</option>
                <option value="ssd">SSD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage Location</label>
            <input
              type="text"
              value={attributes.storage_location || ''}
              onChange={(e) => onAttributeChange('storage_location', e.target.value)}
              placeholder="e.g., Server Rack A, Slot 3"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    case 'tape_cassette':
      return (
        <div className="space-y-4">
          {commonFields}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tape Type</label>
              <select
                value={attributes.tape_type || ''}
                onChange={(e) => onAttributeChange('tape_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="lto">LTO (Linear Tape-Open)</option>
                <option value="dlr">DLT (Digital Linear Tape)</option>
                <option value="ait">AIT (Advanced Intelligent Tape)</option>
                <option value="dds">DDS/DAT (Digital Data Storage)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Capacity (Native)</label>
              <input
                type="text"
                value={attributes.capacity || ''}
                onChange={(e) => onAttributeChange('capacity', e.target.value)}
                placeholder="e.g., 12TB, 18TB, 30TB"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tape Label/ID</label>
              <input
                type="text"
                value={attributes.tape_label || ''}
                onChange={(e) => onAttributeChange('tape_label', e.target.value)}
                placeholder="e.g., TAPE-001, LTO-2024-001"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Generation</label>
              <input
                type="text"
                value={attributes.generation || ''}
                onChange={(e) => onAttributeChange('generation', e.target.value)}
                placeholder="e.g., LTO-9, LTO-8"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">First Used Date</label>
              <input
                type="date"
                value={attributes.first_used_date || ''}
                onChange={(e) => onAttributeChange('first_used_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Retention Period</label>
              <input
                type="text"
                value={attributes.retention_period || ''}
                onChange={(e) => onAttributeChange('retention_period', e.target.value)}
                placeholder="e.g., 5 years, 7 years"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Storage Location</label>
            <input
              type="text"
              value={attributes.storage_location || ''}
              onChange={(e) => onAttributeChange('storage_location', e.target.value)}
              placeholder="e.g., Tape Library, Slot A-12"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
            <textarea
              value={attributes.keterangan || ''}
              onChange={(e) => onAttributeChange('keterangan', e.target.value)}
              rows={2}
              placeholder="Catatan tambahan..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}
