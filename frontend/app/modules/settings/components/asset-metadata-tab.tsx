"use client";

import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { useToast } from "@/components/toast";

interface MetadataItem {
  id: number;
  name: string;
  description?: string;
  color?: string;
  owner_role: string;
  sort_order: number;
  category_id?: number;
  created_at: string;
}

interface MetadataSection {
  key: string;
  label: string;
  endpoint: string;
  hasDescription: boolean;
  hasColor: boolean;
  hasCategory: boolean;
}

const SECTIONS: MetadataSection[] = [
  { key: "categories", label: "Categories", endpoint: "/api/v1/asset-metadata/categories", hasDescription: true, hasColor: false, hasCategory: false },
  { key: "sub-categories", label: "Sub-Categories", endpoint: "/api/v1/asset-metadata/sub-categories", hasDescription: true, hasColor: false, hasCategory: true },
  { key: "classifications", label: "Classifications", endpoint: "/api/v1/asset-metadata/classifications", hasDescription: false, hasColor: true, hasCategory: false },
  { key: "statuses", label: "Statuses", endpoint: "/api/v1/asset-metadata/statuses", hasDescription: false, hasColor: true, hasCategory: false },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Sysadmin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Manager: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export default function AssetMetadataTab() {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState("categories");
  const [items, setItems] = useState<MetadataItem[]>([]);
  const [categories, setCategories] = useState<MetadataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", color: "#6B7280", sort_order: 0, category_id: 0 });
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  const currentSection = SECTIONS.find(s => s.key === activeSection)!;

  useEffect(() => {
    apiRequest("/api/v1/users/me")
      .then((user: any) => setIsSuperadmin(user?.role === "superadmin"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchItems();
    if (currentSection.hasCategory) {
      fetchCategories();
    }
  }, [activeSection]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(currentSection.endpoint);
      setItems(data || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await apiRequest("/api/v1/asset-metadata/categories");
      setCategories(data || []);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const body: any = { name: formData.name, sort_order: formData.sort_order };
    if (currentSection.hasDescription) body.description = formData.description;
    if (currentSection.hasColor) body.color = formData.color;
    if (currentSection.hasCategory && formData.category_id) body.category_id = formData.category_id;

    try {
      if (editingId) {
        await apiRequest(`${currentSection.endpoint}/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
        toast.success("Item updated");
      } else {
        await apiRequest(currentSection.endpoint, { method: "POST", body: JSON.stringify(body) });
        toast.success("Item created");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: "", description: "", color: "#6B7280", sort_order: 0, category_id: 0 });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to save item");
    }
  };

  const handleEdit = (item: MetadataItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      description: item.description || "",
      color: item.color || "#6B7280",
      sort_order: item.sort_order,
      category_id: item.category_id || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await apiRequest(`${currentSection.endpoint}/${id}`, { method: "DELETE" });
      toast.success("Item deleted");
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  if (loading && items.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  const groupedItems = isSuperadmin
    ? items.reduce((acc, item) => {
        const role = item.owner_role;
        if (!acc[role]) acc[role] = [];
        acc[role].push(item);
        return acc;
      }, {} as Record<string, MetadataItem[]>)
    : { "": items };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asset Metadata Management</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: "", description: "", color: "#6B7280", sort_order: 0, category_id: 0 }); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          + Add New
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeSection === s.key
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">{editingId ? "Edit" : "Add"} {currentSection.label}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                required
              />
            </div>
            {currentSection.hasCategory && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Parent Category *</label>
                <select
                  value={formData.category_id || ""}
                  onChange={e => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.owner_role})</option>
                  ))}
                </select>
              </div>
            )}
            {currentSection.hasDescription && (
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                />
              </div>
            )}
            {currentSection.hasColor && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="w-10 h-10 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Sort Order</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={e => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">{editingId ? "Update" : "Save"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Name</th>
              {currentSection.hasDescription && <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Description</th>}
              {currentSection.hasColor && <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Color</th>}
              {isSuperadmin && <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Role</th>}
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Sort</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedItems).map(([role, roleItems]) => (
              <React.Fragment key={role}>
                {isSuperadmin && role && (
                  <tr className="bg-gray-100 dark:bg-gray-700/50">
                    <td colSpan={6} className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${ROLE_COLORS[role] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        {role}
                      </span>
                    </td>
                  </tr>
                )}
                {roleItems.map(item => (
                  <tr key={item.id} className="border-t dark:border-gray-700">
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{item.name}</td>
                    {currentSection.hasDescription && <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.description || "-"}</td>}
                    {currentSection.hasColor && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded border" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-mono text-gray-500 dark:text-gray-400">{item.color}</span>
                        </div>
                      </td>
                    )}
                    {isSuperadmin && (
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[item.owner_role] || "bg-gray-100 text-gray-800"}`}>
                          {item.owner_role}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(item)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm">Edit</button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-8 text-center text-gray-500 dark:text-gray-400">No items found. Click "+ Add New" to create one.</div>}
      </div>
    </div>
  );
}
