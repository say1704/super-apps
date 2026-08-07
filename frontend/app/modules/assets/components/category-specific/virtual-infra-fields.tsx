/**
 * Virtual Infrastructure Category Fields Component
 * 
 * Sub-categories: virtual_machine, container, cloud_instance
 */

"use client";

interface VirtualInfrastructureFieldsProps {
  subCategory: string;
  attributes: Record<string, any>;
  onAttributeChange: (key: string, value: string) => void;
}

export default function VirtualInfrastructureFields({
  subCategory,
  attributes,
  onAttributeChange
}: VirtualInfrastructureFieldsProps) {

  // Common resource fields
  const resourceFields = (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">vCPU / CPU</label>
          <input
            type="text"
            value={attributes.cpu || ''}
            onChange={(e) => onAttributeChange('cpu', e.target.value)}
            placeholder="e.g., 4 vCPU"
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
            placeholder="e.g., 500 GB SSD"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </>
  );

  switch (subCategory) {
    case 'virtual_machine':
      return (
        <div className="space-y-4">
          {resourceFields}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Host Server</label>
              <input
                type="text"
                value={attributes.host_server || ''}
                onChange={(e) => onAttributeChange('host_server', e.target.value)}
                placeholder="e.g., ESXi-01, Proxmox-Node-1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Hypervisor</label>
              <select
                value={attributes.hypervisor || ''}
                onChange={(e) => onAttributeChange('hypervisor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Operating System</label>
              <input
                type="text"
                value={attributes.os || ''}
                onChange={(e) => onAttributeChange('os', e.target.value)}
                placeholder="e.g., Ubuntu 22.04 LTS, Windows Server 2022"
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

    case 'container':
      return (
        <div className="space-y-4">
          {resourceFields}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Container Platform</label>
              <select
                value={attributes.platform || 'docker'}
                onChange={(e) => onAttributeChange('platform', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="docker">Docker</option>
                <option value="kubernetes">Kubernetes</option>
                <option value="podman">Podman</option>
                <option value="lxc">LXC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Image Name</label>
              <input
                type="text"
                value={attributes.image_name || ''}
                onChange={(e) => onAttributeChange('image_name', e.target.value)}
                placeholder="e.g., nginx:latest, myapp:v1.0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Host/Node</label>
              <input
                type="text"
                value={attributes.host || ''}
                onChange={(e) => onAttributeChange('host', e.target.value)}
                placeholder="e.g., k8s-node-01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Namespace (K8s)</label>
              <input
                type="text"
                value={attributes.namespace || ''}
                onChange={(e) => onAttributeChange('namespace', e.target.value)}
                placeholder="e.g., default, production"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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

    case 'cloud_instance':
      return (
        <div className="space-y-4">
          {resourceFields}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Cloud Provider</label>
              <select
                value={attributes.cloud_provider || 'aws'}
                onChange={(e) => onAttributeChange('cloud_provider', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="aws">Amazon Web Services (AWS)</option>
                <option value="azure">Microsoft Azure</option>
                <option value="gcp">Google Cloud Platform (GCP)</option>
                <option value="aliyun">Alibaba Cloud</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Instance Type</label>
              <input
                type="text"
                value={attributes.instance_type || ''}
                onChange={(e) => onAttributeChange('instance_type', e.target.value)}
                placeholder="e.g., t3.medium, Standard_D2s_v3"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Region</label>
              <input
                type="text"
                value={attributes.region || ''}
                onChange={(e) => onAttributeChange('region', e.target.value)}
                placeholder="e.g., ap-southeast-1 (Singapore)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Instance ID</label>
              <input
                type="text"
                value={attributes.instance_id || ''}
                onChange={(e) => onAttributeChange('instance_id', e.target.value)}
                placeholder="e.g., i-0abc123def456789"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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
