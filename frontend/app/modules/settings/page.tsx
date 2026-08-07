"use client";

import { useEffect, useState } from "react";
import { useAuth, apiRequest } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";
import { useToast } from "@/components/toast";
import { getVisibleTabs, SettingsTabKey } from "@/lib/rbac";
import { ALL_MODULES, MODULE_KEYS } from "@/lib/modules";
import AssetMetadataTab from "./components/asset-metadata-tab";
import RetentionTab from "./components/retention-tab";
import AiAuditTab from "./components/ai-audit-tab";

// Settings page module list for access matrix — includes log-maintenance for legacy compatibility
const SETTINGS_MODULES = [
  ...ALL_MODULES.filter((m) => !m.submenu).map((m) => ({ key: m.key, label: m.label })),
  ...ALL_MODULES.filter((m) => m.submenu).flatMap((m) => m.submenu!.map((s) => ({ key: s.key, label: s.label }))),
];

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  modules: string[];
  override_modules?: string[];
  settings_tabs?: string[];
  last_login: string | null;
}

interface Role {
  id: number;
  name: string;
  description: string;
  modules: string[];
  settings_tabs?: string[];
  is_system: boolean;
  user_count: number;
}

interface SMTPConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_use_tls: string;
  smtp_enabled: string;
}

const defaultSMTP: SMTPConfig = {
  smtp_host: "", smtp_port: "587", smtp_username: "", smtp_password: "",
  smtp_from_email: "", smtp_from_name: "Super Apps", smtp_use_tls: "true", smtp_enabled: "false",
};

type TabType = "users" | "roles" | "modules" | "smtp" | "general" | "security" | "notification" | "api" | "backup" | "admin-ui" | "sessions" | "pending-approvals" | "asset-metadata" | "retention" | "ai-audit" | "system-health";

const tabList: { key: TabType; label: string; icon: string }[] = [
  { key: "users", label: "Users", icon: "Users" },
  { key: "pending-approvals", label: "Pending Approvals", icon: "Pending" },
  { key: "roles", label: "Roles", icon: "Roles" },
  { key: "modules", label: "Module Access", icon: "Modules" },
  { key: "asset-metadata", label: "Asset Metadata", icon: "Metadata" },
  { key: "smtp", label: "SMTP", icon: "SMTP" },
  { key: "general", label: "General", icon: "General" },
  { key: "security", label: "Security", icon: "Security" },
  { key: "notification", label: "Notification", icon: "Notify" },
  { key: "api", label: "API & Integrations", icon: "API" },
  { key: "backup", label: "Backup", icon: "Backup" },
  { key: "admin-ui", label: "Admin UI", icon: "Admin" },
  { key: "sessions", label: "Sessions", icon: "Sessions" },
  { key: "retention", label: "Data Retention", icon: "Retention" },
  { key: "ai-audit", label: "AI Audit Trail", icon: "AI" },
  { key: "system-health", label: "System Health", icon: "Health" },
];

/* ==================== SUB-COMPONENTS ==================== */

interface Session {
  id: number;
  user_id: number;
  token_jti: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

function SessionManagementTab() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | null>(null);

  const fetchSessions = async () => {
    try {
      const data = await apiRequest("/auth/sessions");
      setSessions(data.sessions || []);
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const handleRevoke = async (sessionId: number) => {
    setRevoking(sessionId);
    try {
      await apiRequest(`/auth/sessions/${sessionId}/revoke`, { method: "POST" });
      await fetchSessions();
    } catch (e) {
      console.error("Failed to revoke session:", e);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!confirm("Revoke all other sessions? You will remain logged in on this device.")) return;
    try {
      await apiRequest("/auth/sessions/revoke-all", { method: "POST" });
      await fetchSessions();
    } catch (e) {
      console.error("Failed to revoke all sessions:", e);
    }
  };

  const parseBrowser = (ua: string | null) => {
    if (!ua) return "Unknown";
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edg")) return "Edge";
    return "Other";
  };

  const parseOS = (ua: string | null) => {
    if (!ua) return "Unknown";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Macintosh") || ua.includes("Mac OS")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    return "Other";
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "Unknown";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) return <div className="text-center py-8 text-gray-500 dark:text-slate-400">Loading sessions...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Active Sessions</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Manage your active login sessions across devices</p>
      </div>

      <div className="flex gap-3">
        <button onClick={fetchSessions} className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-600 font-medium">
          Refresh
        </button>
        <button onClick={handleRevokeAll} disabled={sessions.length <= 1} className="px-4 py-2 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-700 font-medium disabled:opacity-40">
          Revoke All Others
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-slate-500">No active sessions</div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-800/60 rounded-xl p-4 border border-gray-200 dark:border-slate-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{parseBrowser(s.user_agent)} on {parseOS(s.user_agent)}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{s.ip_address || "Unknown IP"} · Started {formatTime(s.created_at)}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(s.id)}
                  disabled={revoking === s.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/50 rounded-lg hover:bg-red-900/30 disabled:opacity-40"
                >
                  {revoking === s.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PendingUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string | null;
}

function PendingApprovalsTab({ onMessage }: { onMessage: (msg: string) => void }) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Record<number, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  // Bulk action states
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<number>>(new Set());
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkPendingRoles, setBulkPendingRoles] = useState<Record<number, string>>({});
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiRequest("/api/settings/users?status=pending_approval"),
        apiRequest("/api/settings/roles"),
      ]);
      setPendingUsers(usersRes.data || usersRes || []);
      setRoles(rolesRes.data || rolesRes || []);
    } catch (e) {
      console.error("Failed to fetch pending approvals:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleApprove = async (userId: number) => {
    const role = selectedRole[userId];
    if (!role) {
      onMessage("Please select a role before approving");
      return;
    }
    setProcessing(userId);
    try {
      await apiRequest(`/api/settings/users/${userId}/approve`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      onMessage("User approved successfully");
      await fetchData();
    } catch (e: any) {
      onMessage(e.message || "Failed to approve user");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId: number) => {
    setProcessing(userId);
    try {
      await apiRequest(`/api/settings/users/${userId}/reject`, {
        method: "POST",
        body: JSON.stringify({ role: "viewer", reason: rejectReason[userId] || undefined }),
      });
      onMessage("User rejected");
      setShowRejectModal(null);
      setRejectReason({});
      await fetchData();
    } catch (e: any) {
      onMessage(e.message || "Failed to reject user");
    } finally {
      setProcessing(null);
    }
  };

  // Bulk pending action helpers
  const togglePendingSelection = (userId: number) => {
    setSelectedPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAllPending = () => {
    const allSelected = pendingUsers.every((u) => selectedPendingIds.has(u.id));
    if (allSelected) {
      setSelectedPendingIds(new Set());
    } else {
      setSelectedPendingIds(new Set(pendingUsers.map((u) => u.id)));
    }
  };

  const openBulkPendingApprove = () => {
    const roles: Record<number, string> = {};
    selectedPendingIds.forEach((id) => { roles[id] = "viewer"; });
    setBulkPendingRoles(roles);
    setShowBulkApproveModal(true);
  };

  const handleBulkPendingApprove = async () => {
    const users = Array.from(selectedPendingIds).map((id) => ({
      user_id: id,
      role: bulkPendingRoles[id] || "viewer",
    }));
    setBulkProcessing(true);
    try {
      await apiRequest("/api/settings/users/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ users }),
      });
      onMessage("Users approved successfully");
      setShowBulkApproveModal(false);
      setSelectedPendingIds(new Set());
      await fetchData();
    } catch (err: any) {
      onMessage(err.message || "Failed to approve users");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkPendingReject = async () => {
    setBulkProcessing(true);
    try {
      await apiRequest("/api/settings/users/bulk-reject", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedPendingIds), reason: bulkRejectReason || undefined }),
      });
      onMessage("Users rejected");
      setShowBulkRejectModal(false);
      setBulkRejectReason("");
      setSelectedPendingIds(new Set());
      await fetchData();
    } catch (err: any) {
      onMessage(err.message || "Failed to reject users");
    } finally {
      setBulkProcessing(false);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "Unknown";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) return <div className="text-center py-8 text-gray-500 dark:text-slate-400">Loading...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Pending Approvals</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Review and approve/reject new user registrations</p>
      </div>

      {/* Bulk Action Bar */}
      {selectedPendingIds.size > 0 && (
        <div className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-blue-300 font-medium">{selectedPendingIds.size} user(s) selected</span>
          <div className="flex gap-2">
            <button onClick={openBulkPendingApprove} className="px-3 py-1.5 bg-green-600/80 text-white text-xs rounded-lg hover:bg-green-600 font-medium">Approve Selected</button>
            <button onClick={() => setShowBulkRejectModal(true)} className="px-3 py-1.5 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Reject Selected</button>
            <button onClick={() => setSelectedPendingIds(new Set())} className="px-3 py-1.5 bg-slate-600/80 text-white text-xs rounded-lg hover:bg-slate-600 font-medium">Clear</button>
          </div>
        </div>
      )}

      {pendingUsers.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800/40 rounded-xl border border-gray-200 dark:border-slate-700/50">
          <p className="text-gray-500 dark:text-slate-400">No pending registrations</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header row for select all */}
          <div className="flex items-center gap-3 px-5 py-2 text-xs text-gray-400 dark:text-slate-500 font-medium">
            <input type="checkbox" checked={pendingUsers.length > 0 && pendingUsers.every((u) => selectedPendingIds.has(u.id))} onChange={toggleAllPending} className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
            <span>Select all</span>
          </div>

          {pendingUsers.map((u) => (
            <div key={u.id} className={`bg-white dark:bg-slate-800/60 rounded-xl p-5 border transition-colors ${selectedPendingIds.has(u.id) ? "border-blue-500/50 bg-blue-600/10" : "border-gray-200 dark:border-slate-700/50"}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <input type="checkbox" checked={selectedPendingIds.has(u.id)} onChange={() => togglePendingSelection(u.id)} className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 flex-shrink-0" />
                  <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-400 font-bold flex-shrink-0">
                    {u.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{u.full_name}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">@{u.username} · {u.email}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">Registered {formatTime(u.created_at)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={selectedRole[u.id] || ""}
                    onChange={(e) => setSelectedRole({ ...selectedRole, [u.id]: e.target.value })}
                    className="px-3 py-2 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select Role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleApprove(u.id)}
                    disabled={processing === u.id}
                    className="px-4 py-2 bg-green-600/80 text-white text-sm rounded-lg hover:bg-green-600 font-medium disabled:opacity-40"
                  >
                    {processing === u.id ? "..." : "Approve"}
                  </button>

                  <button
                    onClick={() => setShowRejectModal(u.id)}
                    disabled={processing === u.id}
                    className="px-4 py-2 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-600 font-medium disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRejectModal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-slate-700/50">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-3">Reject Registration</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              Reject <strong>{pendingUsers.find((u) => u.id === showRejectModal)?.full_name}</strong>?
            </p>
            <div className="mb-4">
              <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">Reason (optional)</label>
              <textarea
                value={rejectReason[showRejectModal] || ""}
                onChange={(e) => setRejectReason({ ...rejectReason, [showRejectModal]: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-red-500 focus:outline-none"
                rows={3}
                placeholder="e.g. Does not meet requirements"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(null); setRejectReason({}); }}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={processing === showRejectModal}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium disabled:opacity-40"
              >
                {processing === showRejectModal ? "..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Approve Modal */}
      {showBulkApproveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-lg w-full mx-4 border border-gray-200 dark:border-slate-700/50 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">Bulk Approve</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Assign roles for {selectedPendingIds.size} user(s)</p>

            <div className="space-y-3 mb-5">
              {Array.from(selectedPendingIds).map((id) => {
                const user = pendingUsers.find((u) => u.id === id);
                if (!user) return null;
                return (
                  <div key={id} className="flex items-center justify-between bg-gray-100 dark:bg-slate-700/40 rounded-lg p-3 border border-gray-300 dark:border-slate-600/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{user.full_name}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500">@{user.username}</div>
                      </div>
                    </div>
                    <select
                      value={bulkPendingRoles[id] || ""}
                      onChange={(e) => setBulkPendingRoles({ ...bulkPendingRoles, [id]: e.target.value })}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select Role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-end border-t border-gray-200 dark:border-slate-700/50 pt-4">
              <button
                onClick={() => setShowBulkApproveModal(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkPendingApprove}
                disabled={bulkProcessing || Array.from(selectedPendingIds).some((id) => !bulkPendingRoles[id])}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-40"
              >
                {bulkProcessing ? "Processing..." : "Approve All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-slate-700/50">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">Bulk Reject</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              Reject <strong>{selectedPendingIds.size}</strong> user(s)?
            </p>
            <div className="mb-4">
              <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">Reason (optional)</label>
              <textarea
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-red-500 focus:outline-none"
                rows={3}
                placeholder="e.g. Does not meet requirements"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(""); }}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkPendingReject}
                disabled={bulkProcessing}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium disabled:opacity-40"
              >
                {bulkProcessing ? "Processing..." : "Reject All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ value, onChange }: { value: string; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className={`w-11 h-6 rounded-full transition-colors relative ${value === "true" ? "bg-blue-600" : "bg-slate-600"}`}>
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow ${value === "true" ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors" />
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3.5 py-2.5 pr-10 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:text-slate-200 transition-colors" title={show ? "Hide" : "Show"}>
          {show ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

function Card({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/50 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-base">{title}</h3>
          {description && <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* ==================== MAIN COMPONENT ==================== */

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ username: "", email: "", full_name: "", password: "", role: "superadmin" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // Banner color: default to error (red). Only known success phrases render green.
  // This guarantees every validation/backend error — including arbitrary err.message —
  // shows red. All success messages in this page contain one of these tokens; any NEW
  // success message MUST include one (berhasil / successfully / updated to / dihapus / rejected).
  const isSuccessMessage = (msg: string) =>
    /berhasil|successfully|updated to|dihapus|rejected/i.test(msg);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleFormData, setRoleFormData] = useState({ name: "", description: "", modules: [] as string[], settings_tabs: [] as string[] });

  const [smtp, setSmtp] = useState<SMTPConfig>(defaultSMTP);
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [allowedSmtpHosts, setAllowedSmtpHosts] = useState("");

  const [general, setGeneral] = useState({ app_name: "", timezone: "Asia/Jakarta", date_format: "DD/MM/YYYY", language: "id", session_timeout: "1440" });
  const [security, setSecurity] = useState({ min_password_length: "8", require_uppercase: "true", require_numbers: "true", require_special_chars: "false", password_expiry_days: "0", max_login_attempts: "5", lockout_duration_minutes: "30", two_factor_enabled: "false", otp_enabled: "false" });
  const [notification, setNotification] = useState({ incident_email: "true", vulnerability_email: "true", backup_failure_email: "true", task_due_email: "true", weekly_report_email: "false", alert_recipients: "" });
  const [api, setApi] = useState({ api_key_primary: "", api_key_secondary: "", webhook_url: "", webhook_enabled: "false" });

  const [backups, setBackups] = useState<{ filename: string; size_mb: number; created_at: string }[]>([]);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [adminUI, setAdminUI] = useState({ enabled: false, url: null as string | null });
  const [adminUIPassword, setAdminUIPassword] = useState("");
  const [adminUISaving, setAdminUISaving] = useState(false);
  const [adminUIRestarting, setAdminUIRestarting] = useState(false);
  const [showAdminUIPassword, setShowAdminUIPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: "", color: "" });

  const [metrics, setMetrics] = useState<any>(null);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [errorLogTotal, setErrorLogTotal] = useState(0);
  const [errorLogPage, setErrorLogPage] = useState(1);
  const [errorLogLevel, setErrorLogLevel] = useState("");
  const [errorLogDays, setErrorLogDays] = useState(7);

  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Bulk action states
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkApproveRoles, setBulkApproveRoles] = useState<Record<number, string>>({});
  const [bulkNewStatus, setBulkNewStatus] = useState("active");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const isAdmin = user?.role === "superadmin";
  const visibleTabKeys = getVisibleTabs(user?.role, user?.settings_tabs);
  const filteredTabList = tabList.filter((t) => visibleTabKeys.includes(t.key as SettingsTabKey));
  const { isConnected, onlineUsers } = useRealtimeEvents({
    user_online: () => {},
    user_offline: () => {},
  });

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (visibleTabKeys.length > 0 && !visibleTabKeys.includes(activeTab as SettingsTabKey)) {
      setActiveTab(visibleTabKeys[0] as TabType);
    }
  }, [user, visibleTabKeys]);

  useEffect(() => {
    if (!user) return;
    fetchUsers();
    fetchRoles();
    if (isAdmin) {
      fetchSMTP();
      fetchAllowedSmtpHosts();
      fetchSettings("security", setSecurity as any);
      fetchSettings("api", setApi as any);
      fetchAdminUI();
    }
    fetchSettings("general", setGeneral as any);
    fetchSettings("notification", setNotification as any);
    fetchBackups();
    fetchPendingCount();
  }, [user, router]);

  const fetchPendingCount = async () => {
    try {
      const res = await apiRequest("/api/settings/users?status=pending_approval&page=1&page_size=1");
      const total = res.pagination?.total_records || 0;
      setPendingCount(total);
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk action helpers
  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAllUsers = (userIds: number[]) => {
    const allSelected = userIds.every((id) => selectedUserIds.has(id));
    if (allSelected) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        userIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        userIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const openBulkApprove = () => {
    const roles: Record<number, string> = {};
    selectedUserIds.forEach((id) => { roles[id] = "viewer"; });
    setBulkApproveRoles(roles);
    setShowBulkApproveModal(true);
  };

  const handleBulkApprove = async () => {
    const users = Array.from(selectedUserIds).map((id) => ({
      user_id: id,
      role: bulkApproveRoles[id] || "viewer",
    }));
    setBulkProcessing(true);
    try {
      await apiRequest("/api/settings/users/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ users }),
      });
      setMessage("Users approved successfully");
      setShowBulkApproveModal(false);
      setSelectedUserIds(new Set());
      fetchUsers();
      fetchPendingCount();
    } catch (err: any) {
      setMessage(err.message || "Failed to approve users");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkProcessing(true);
    try {
      await apiRequest("/api/settings/users/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedUserIds) }),
      });
      setMessage("Users deleted successfully");
      setShowBulkDeleteModal(false);
      setSelectedUserIds(new Set());
      fetchUsers();
    } catch (err: any) {
      setMessage(err.message || "Failed to delete users");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkStatus = async () => {
    setBulkProcessing(true);
    try {
      await apiRequest("/api/settings/users/bulk-status", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedUserIds), status: bulkNewStatus }),
      });
      setMessage(`Users updated to ${bulkNewStatus}`);
      setShowBulkStatusModal(false);
      setSelectedUserIds(new Set());
      fetchUsers();
    } catch (err: any) {
      setMessage(err.message || "Failed to update users");
    } finally {
      setBulkProcessing(false);
    }
  };

  const fetchUsers = async () => {
    try { const res = await apiRequest("/api/settings/users"); setUsers(res.data || res); } catch (err: any) { toast.error(err.message || "Failed to load users"); } finally { setLoading(false); }
  };

  const fetchRoles = async () => {
    try { const res = await apiRequest("/api/settings/roles"); setRoles(res.data || res); } catch (err: any) { toast.error(err.message || "Failed to load roles"); }
  };

  const fetchSMTP = async () => {
    try { const data = await apiRequest("/api/settings/smtp"); setSmtp({ ...defaultSMTP, ...data }); } catch (err: any) { toast.error(err.message || "Failed to load SMTP settings"); }
  };

  const fetchAllowedSmtpHosts = async () => {
    try {
      const data = await apiRequest("/api/settings/security");
      setAllowedSmtpHosts(data.allowed_smtp_hosts || "");
    } catch (err: any) { /* ignore if not found */ }
  };

  const fetchSettings = async (category: string, setter: (d: any) => void) => {
    try { const data = await apiRequest(`/api/settings/${category}`); setter(data); } catch (err: any) { toast.error(err.message || `Failed to load ${category} settings`); }
  };

  const fetchBackups = async () => {
    try { const data = await apiRequest("/api/settings/backup/list"); setBackups(data.backups || []); } catch (err: any) { toast.error(err.message || "Failed to load backups"); }
  };

  const saveCategory = async (category: string, data: any) => {
    setSaving(true);
    try {
      await apiRequest(`/api/settings/${category}`, { method: "PUT", body: JSON.stringify(data) });
      setMessage(`${category} settings berhasil disimpan`);
    } catch (err: any) { setMessage(err.message || "Gagal menyimpan"); } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!formData.username || !formData.email || !formData.full_name) { setMessage("Username, email, dan nama wajib diisi"); return; }
    if (!editingUser && !formData.password) { setMessage("Password wajib untuk user baru"); return; }
    setSaving(true); setMessage("");
    try {
      if (editingUser) {
        await apiRequest(`/api/settings/users/${editingUser.id}`, { method: "PUT", body: JSON.stringify({ email: formData.email, full_name: formData.full_name, role: formData.role, password: formData.password || undefined, is_active: editingUser.is_active }) });
        setMessage("User berhasil diupdate");
      } else {
        await apiRequest("/api/settings/users", { method: "POST", body: JSON.stringify(formData) });
        setMessage("User berhasil dibuat");
      }
      setShowForm(false); setEditingUser(null); setFormData({ username: "", email: "", full_name: "", password: "", role: "superadmin" });
      fetchUsers();
    } catch (err: any) { setMessage(err.message || "Gagal menyimpan"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await apiRequest(`/api/settings/users/${id}`, { method: "DELETE" }); setMessage("User berhasil dihapus"); fetchUsers(); } catch (err: any) { setMessage(err.message || "Gagal menghapus"); }
    setDeleteUserId(null);
  };

  const toggleActive = async (u: User) => {
    try { await apiRequest(`/api/settings/users/${u.id}`, { method: "PUT", body: JSON.stringify({ is_active: !u.is_active }) }); fetchUsers(); } catch (err: any) { setMessage(err.message); }
  };

  const toggleModule = async (userId: number, moduleKey: string, current: boolean) => {
    const user = users.find((u) => u.id === userId);
    const effectiveModules = user?.modules ?? [];
    const updated = SETTINGS_MODULES.map((m) => ({
      module: m.key,
      can_access: m.key === moduleKey ? !current : effectiveModules.includes(m.key),
    }));
    try { await apiRequest(`/api/settings/users/${userId}/modules`, { method: "PUT", body: JSON.stringify(updated) }); fetchUsers(); } catch (err: any) { setMessage(err.message); }
  };

  const handleRoleSubmit = async () => {
    if (!roleFormData.name) { setMessage("Nama role wajib diisi"); return; }
    setSaving(true); setMessage("");
    try {
      if (editingRole) {
        await apiRequest(`/api/settings/roles/${editingRole.id}`, { method: "PUT", body: JSON.stringify({ name: roleFormData.name, description: roleFormData.description, modules: roleFormData.modules, settings_tabs: roleFormData.settings_tabs }) });
        setMessage("Role berhasil diupdate");
      } else {
        await apiRequest("/api/settings/roles", { method: "POST", body: JSON.stringify(roleFormData) });
        setMessage("Role berhasil dibuat");
      }
      setShowRoleForm(false); setEditingRole(null); setRoleFormData({ name: "", description: "", modules: [], settings_tabs: ["general", "sessions"] });
      fetchRoles();
    } catch (err: any) { setMessage(err.message || "Gagal menyimpan"); } finally { setSaving(false); }
  };

  const handleDeleteRole = async (id: number) => {
    if (!confirm("Hapus role ini?")) return;
    try { await apiRequest(`/api/settings/roles/${id}`, { method: "DELETE" }); setMessage("Role berhasil dihapus"); fetchRoles(); } catch (err: any) { setMessage(err.message || "Gagal menghapus"); }
  };

  const toggleRoleModule = (modKey: string) => {
    setRoleFormData((prev) => ({
      ...prev,
      modules: prev.modules.includes(modKey) ? prev.modules.filter((m) => m !== modKey) : [...prev.modules, modKey],
    }));
  };

  const saveSMTP = async () => {
    setSmtpSaving(true); setMessage("");
    try { await apiRequest("/api/settings/smtp", { method: "PUT", body: JSON.stringify(smtp) }); setMessage("SMTP settings berhasil disimpan"); } catch (err: any) { setMessage(err.message || "Gagal menyimpan"); } finally { setSmtpSaving(false); }
  };

  const testSMTP = async () => {
    if (!smtpTestEmail) { setMessage("Masukkan email tujuan untuk test"); return; }
    setSmtpTesting(true); setMessage("");
    try { const res = await apiRequest("/api/settings/smtp/test", { method: "POST", body: JSON.stringify({ ...smtp, to_email: smtpTestEmail }) }); setMessage(res.message || "Email test berhasil dikirim"); } catch (err: any) { setMessage(err.message || "Gagal kirim email test"); } finally { setSmtpTesting(false); }
  };

  const doBackup = async () => {
    setSaving(true); setMessage("");
    try { const res = await apiRequest("/api/settings/backup", { method: "POST" }); setMessage(res.message); fetchBackups(); } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  };

  const doRestore = async (filename: string) => {
    if (!confirm(`Restore database dari ${filename}? Data saat ini akan diganti.`)) return;
    setSaving(true); setMessage("");
    try { const res = await apiRequest("/api/settings/backup/restore", { method: "POST", body: JSON.stringify({ filename }) }); setMessage(res.message); setTimeout(() => { window.location.href = '/login'; }, 2000); } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  };

  const doDeleteBackup = async (filename: string) => {
    if (!confirm(`Hapus backup ${filename}?`)) return;
    try { await apiRequest(`/api/settings/backup/${filename}`, { method: "DELETE" }); setMessage("Backup dihapus"); fetchBackups(); } catch (err: any) { setMessage(err.message); }
  };

  const doDownloadBackup = async (filename: string) => {
    try {
      const token = sessionStorage.getItem("sa_auth_token");
      const response = await fetch(`/api/proxy/api/v1/settings/backup/download/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "Gagal download backup");
    }
  };

  const doUploadRestore = async () => {
    if (!restoreFile) return;
    if (!confirm(`Restore database dari file ${restoreFile.name}? Data saat ini akan diganti.`)) return;
    setRestoring(true); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", restoreFile);
      const res = await apiRequest("/api/settings/backup/upload-restore", { method: "POST", body: formData, headers: {} });
      toast.success(res.message || "Restore berhasil");
      setRestoreFile(null);
      setTimeout(() => { window.location.href = '/login'; }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Gagal restore dari file");
    } finally {
      setRestoring(false);
    }
  };

  const fetchAdminUI = async () => {
    try { const data = await apiRequest("/api/settings/admin-ui"); setAdminUI({ enabled: data.enabled, url: data.url || null }); } catch (err) { console.error(err); }
  };

  const fetchMetrics = async () => {
    try { const data = await apiRequest("/api/settings/metrics"); setMetrics(data); } catch (err) { console.error(err); }
  };

  const fetchErrorLogs = async () => {
    try {
      const data = await apiRequest(`/api/settings/error-logs?days=${errorLogDays}&level=${errorLogLevel}&page=${errorLogPage}&page_size=50`);
      setErrorLogs(data.items || []);
      setErrorLogTotal(data.total || 0);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === "system-health") {
      fetchMetrics();
      fetchErrorLogs();
      const interval = setInterval(fetchMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, errorLogPage, errorLogLevel, errorLogDays]);

  const purgeErrorLogs = async () => {
    if (!confirm("Hapus semua error logs >30 hari?")) return;
    try {
      const res = await apiRequest("/api/settings/error-logs/purge?days=30", { method: "DELETE" });
      toast.success(res.message);
      fetchErrorLogs();
    } catch (err: any) {
      toast.error(err.message || "Gagal hapus error logs");
    }
  };

  const checkPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) setPasswordStrength({ score, label: "Weak", color: "text-red-400" });
    else if (score <= 4) setPasswordStrength({ score, label: "Medium", color: "text-amber-400" });
    else setPasswordStrength({ score, label: "Strong", color: "text-green-400" });
  };

  const saveAdminUI = async () => {
    if (!adminUIPassword.trim()) { setMessage("Password tidak boleh kosong"); return; }
    setAdminUISaving(true); setMessage("");
    try {
      const res = await apiRequest("/api/settings/admin-ui", { method: "POST", body: JSON.stringify({ password: adminUIPassword }) });
      setMessage(res.message || "Password Admin UI berhasil diupdate");
      setAdminUIPassword("");
      setPasswordStrength({ score: 0, label: "", color: "" });
      fetchAdminUI();
    } catch (err: any) { setMessage(err.message || "Gagal mengupdate"); } finally { setAdminUISaving(false); }
  };

  const restartAdminUI = async () => {
    setAdminUIRestarting(true); setMessage("");
    try {
      const res = await apiRequest("/api/settings/admin-ui/restart", { method: "POST" });
      setMessage(res.message || "Admin UI berhasil di-restart");
      fetchAdminUI();
    } catch (err: any) { setMessage(err.message || "Gagal restart"); } finally { setAdminUIRestarting(false); }
  };

  if (!user || loading) return <div className="flex items-center justify-center h-screen text-gray-700 dark:text-slate-300 text-lg">Loading...</div>;

  return (
    <div className="flex h-full">
      {/* Sidebar Tabs */}
      <div className="w-56 flex-shrink-0 bg-white dark:bg-slate-800/40 border-r border-gray-200 dark:border-slate-700/50 p-3 overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 px-3 py-2 mb-2">Settings</h2>
        <nav className="space-y-0.5">
          {filteredTabList.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:bg-slate-700/50 hover:text-gray-800 dark:text-slate-200 border border-transparent"
              }`}
            >
              <span>{t.label}</span>
              {t.key === "pending-approvals" && pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-amber-600/30 text-amber-300 text-xs rounded-full font-bold">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          {message && (
            <div className={`p-3.5 rounded-lg mb-5 text-sm font-medium border ${isSuccessMessage(message) ? "bg-green-900/30 text-green-300 border-green-800/50" : "bg-red-900/30 text-red-300 border-red-800/50"}`}>{message}</div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">User Management</h1>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Kelola user dan akses mereka</p>
                </div>
                <button onClick={() => { setShowForm(true); setEditingUser(null); setFormData({ username: "", email: "", full_name: "", password: "", role: roles.length > 0 ? roles[0].name : "superadmin" }); }} className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">+ Tambah User</button>
              </div>

              {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingUser(null); } }}>
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{editingUser ? "Edit User" : "User Baru"}</h2>
                      <button onClick={() => { setShowForm(false); setEditingUser(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400" aria-label="Close">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="p-5 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} placeholder="username" />
                        <InputField label="Email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} placeholder="email@domain.com" />
                        <InputField label="Nama Lengkap" value={formData.full_name} onChange={(v) => setFormData({ ...formData, full_name: v })} placeholder="Full Name" />
                        <PasswordField label="Password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} placeholder={editingUser ? "Kosongkan jika tidak diubah" : "Min 8 karakter"} />
                        <div>
                          <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">Role</label>
                          <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none">
                            {roles.map((r) => <option key={r.name} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-slate-700">
                        <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
                        <button onClick={() => { setShowForm(false); setEditingUser(null); }} className="px-5 py-2.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-500 font-medium">Batal</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-600'}`} />
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={showOnlineOnly} onChange={(e) => setShowOnlineOnly(e.target.checked)} className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
                    Show online only ({onlineUsers.length} online)
                  </label>
                </div>
              )}

              {/* Bulk Action Bar */}
              {selectedUserIds.size > 0 && (
                <div className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm text-blue-300 font-medium">{selectedUserIds.size} user(s) selected</span>
                  <div className="flex gap-2">
                    <button onClick={openBulkApprove} className="px-3 py-1.5 bg-green-600/80 text-white text-xs rounded-lg hover:bg-green-600 font-medium">Approve</button>
                    <button onClick={() => setShowBulkStatusModal(true)} className="px-3 py-1.5 bg-blue-600/80 text-white text-xs rounded-lg hover:bg-blue-600 font-medium">Change Status</button>
                    <button onClick={() => setShowBulkDeleteModal(true)} className="px-3 py-1.5 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Delete</button>
                    <button onClick={() => setSelectedUserIds(new Set())} className="px-3 py-1.5 bg-slate-600/80 text-white text-xs rounded-lg hover:bg-slate-600 font-medium">Clear</button>
                  </div>
                </div>
              )}

              <Card title={`Daftar User (${users.length})`}>
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300"><tr><th className="px-5 py-3 text-left font-medium w-10"><input type="checkbox" checked={users.length > 0 && users.every((u) => selectedUserIds.has(u.id))} onChange={() => toggleAllUsers(users.map((u) => u.id))} className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" /></th><th className="px-5 py-3 text-left font-medium">Username</th><th className="px-5 py-3 text-left font-medium">Nama</th><th className="px-5 py-3 text-left font-medium">Email</th><th className="px-5 py-3 text-left font-medium">Role</th><th className="px-5 py-3 text-left font-medium">Status</th>{isAdmin && <th className="px-5 py-3 text-left font-medium">Last Login</th>}<th className="px-5 py-3 text-left font-medium">Modules</th><th className="px-5 py-3 text-left font-medium">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {users.filter((u) => {
                        if (!isAdmin || !showOnlineOnly) return true;
                        return onlineUsers.some((ou) => ou.user_id === u.id);
                      }).map((u) => {
                        const isOnline = isAdmin && onlineUsers.some((ou) => ou.user_id === u.id);
                        const onlineUser = isAdmin ? onlineUsers.find((ou) => ou.user_id === u.id) : null;
                        const formatLastLogin = (lastLogin: string | null) => {
                          if (!lastLogin) return "Never";
                          const d = new Date(lastLogin);
                          const now = new Date();
                          const diff = now.getTime() - d.getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 1) return "Just now";
                          if (mins < 60) return `${mins}m ago`;
                          const hrs = Math.floor(mins / 60);
                          if (hrs < 24) return `${hrs}h ago`;
                          const days = Math.floor(hrs / 24);
                          return `${days}d ago`;
                        };
                        return (
                          <tr key={u.id} className={`hover:bg-gray-100 dark:bg-slate-700/30 transition-colors ${selectedUserIds.has(u.id) ? "bg-blue-600/10" : ""}`}>
                            <td className="px-5 py-3.5"><input type="checkbox" checked={selectedUserIds.has(u.id)} onChange={() => toggleUserSelection(u.id)} className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" /></td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                {isAdmin && <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-slate-600"}`} />}
                                <span className="text-gray-900 dark:text-slate-100 font-medium">{u.username}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-gray-700 dark:text-slate-300">{u.full_name}</td>
                            <td className="px-5 py-3.5 text-gray-500 dark:text-slate-400">{u.email}</td>
                            <td className="px-5 py-3.5"><span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/30 text-blue-300">{u.role}</span></td>
                            <td className="px-5 py-3.5"><button onClick={() => toggleActive(u)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${u.is_active ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>{u.is_active ? "Active" : "Inactive"}</button></td>
                            {isAdmin && <td className="px-5 py-3.5 text-gray-500 dark:text-slate-400 text-xs">{formatLastLogin(u.last_login)}</td>}
                            <td className="px-5 py-3.5 text-gray-500 dark:text-slate-400">{u.modules?.length || 0}/{SETTINGS_MODULES.length}</td>
                            <td className="px-5 py-3.5"><div className="flex gap-2"><button onClick={() => { setEditingUser(u); setShowForm(true); setFormData({ username: u.username, email: u.email, full_name: u.full_name, password: "", role: u.role }); }} className="px-3 py-1.5 bg-blue-600/80 text-white text-xs rounded-lg hover:bg-blue-600 font-medium">Edit</button><button onClick={() => setDeleteUserId(u.id)} className="px-3 py-1.5 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Hapus</button></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {deleteUserId !== null && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-slate-700/50">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-3">Hapus User</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                      Hapus <strong>{users.find((u) => u.id === deleteUserId)?.full_name || users.find((u) => u.id === deleteUserId)?.username}</strong>? Aksi ini tidak bisa dibatalkan.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setDeleteUserId(null)} className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-200 text-sm rounded-lg hover:bg-slate-600 font-medium">Batal</button>
                      <button onClick={() => handleDelete(deleteUserId)} disabled={saving} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium disabled:opacity-40">{saving ? "..." : "Hapus"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending Approvals Tab */}
          {activeTab === "pending-approvals" && (
            <PendingApprovalsTab onMessage={setMessage} />
          )}

          {/* Roles Tab */}
          {activeTab === "roles" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Role Management</h1>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Kelola role dan module access — user otomatis dapat akses sesuai role</p>
                </div>
                <button onClick={() => { setShowRoleForm(true); setEditingRole(null); setRoleFormData({ name: "", description: "", modules: [], settings_tabs: ["general", "sessions"] }); }} className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">+ Tambah Role</button>
              </div>

              {showRoleForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowRoleForm(false); setEditingRole(null); } }}>
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{editingRole ? "Edit Role" : "Role Baru"}</h2>
                      <button onClick={() => { setShowRoleForm(false); setEditingRole(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400" aria-label="Close">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="p-5 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="Nama Role" value={roleFormData.name} onChange={(v) => setRoleFormData({ ...roleFormData, name: v })} placeholder="e.g. developer" />
                        <InputField label="Deskripsi" value={roleFormData.description} onChange={(v) => setRoleFormData({ ...roleFormData, description: v })} placeholder="Deskripsi role" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-slate-400 mb-2 block font-medium">Module Access</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {SETTINGS_MODULES.map((m) => {
                            const checked = roleFormData.modules.includes(m.key);
                            return (
                              <button key={m.key} type="button" onClick={() => toggleRoleModule(m.key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${checked ? "bg-blue-600/20 border-blue-500/40 text-blue-300" : "bg-gray-100 dark:bg-slate-700/40 border-gray-300 dark:border-slate-600/30 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:bg-slate-700/60"}`}>
                                <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${checked ? "bg-blue-600 text-white" : "bg-slate-600"}`}>{checked ? "✓" : ""}</span>
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-slate-400 mb-2 block font-medium">Settings Tab Access</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {tabList.map((t) => {
                            const checked = roleFormData.settings_tabs.includes(t.key);
                            return (
                              <button key={t.key} type="button" onClick={() => setRoleFormData((prev) => ({ ...prev, settings_tabs: prev.settings_tabs.includes(t.key) ? prev.settings_tabs.filter((s) => s !== t.key) : [...prev.settings_tabs, t.key] }))} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${checked ? "bg-blue-600/20 border-blue-500/40 text-blue-300" : "bg-gray-100 dark:bg-slate-700/40 border-gray-300 dark:border-slate-600/30 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:bg-slate-700/60"}`}>
                                <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${checked ? "bg-blue-600 text-white" : "bg-slate-600"}`}>{checked ? "✓" : ""}</span>
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-slate-700">
                        <button onClick={handleRoleSubmit} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
                        <button onClick={() => { setShowRoleForm(false); setEditingRole(null); }} className="px-5 py-2.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-500 font-medium">Batal</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map((r) => (
                  <Card key={r.id} title={r.name} description={r.description || "No description"}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {r.is_system && <span className="px-2 py-0.5 rounded text-xs bg-amber-600/30 text-amber-300 font-medium">System</span>}
                        <span className="text-xs text-gray-500 dark:text-slate-400">{r.user_count} user(s)</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400">{r.modules.length} modules</span>
                        <span className="text-xs text-gray-500 dark:text-slate-400">{(r.settings_tabs || []).length} tabs</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {r.modules.map((m) => {
                        const mod = SETTINGS_MODULES.find((a) => a.key === m);
                        return <span key={m} className="px-2 py-0.5 rounded text-xs bg-slate-600/50 text-gray-700 dark:text-slate-300">{mod?.label || m}</span>;
                      })}
                    </div>
                    {!r.is_system && (
                      <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-slate-700/50">
                        <button onClick={() => { setEditingRole(r); setShowRoleForm(true); setRoleFormData({ name: r.name, description: r.description, modules: [...r.modules], settings_tabs: [...(r.settings_tabs || ["general", "sessions"])] }); }} className="px-3 py-1.5 bg-blue-600/80 text-white text-xs rounded-lg hover:bg-blue-600 font-medium">Edit</button>
                        <button onClick={() => handleDeleteRole(r.id)} className="px-3 py-1.5 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Hapus</button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Module Access Tab */}
          {activeTab === "modules" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Module Access Override</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Override akses module per user (default mengikuti role)</p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800/40 rounded-xl px-5 py-3 border border-gray-200 dark:border-slate-700/50">
                <span className="font-medium">Legend:</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-green-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
                  <span>Explicit override</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-blue-600/60 text-blue-200 flex items-center justify-center text-xs font-bold">✓</span>
                  <span>Inherited from role</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-slate-600/40 text-gray-400 dark:text-slate-500 flex items-center justify-center text-xs font-bold"> </span>
                  <span>No access</span>
                </div>
              </div>

              <Card title="Access Matrix">
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300"><tr><th className="px-5 py-3 text-left font-medium sticky left-0 bg-gray-100 dark:bg-slate-700/80 z-10">User</th>{SETTINGS_MODULES.map((m) => (<th key={m.key} className="px-2 py-3 text-center text-xs font-medium whitespace-nowrap" title={m.label}>{m.label}</th>))}</tr></thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {users.map((u) => (<tr key={u.id} className="hover:bg-gray-100 dark:bg-slate-700/30 transition-colors"><td className="px-5 py-3 text-gray-900 dark:text-slate-100 font-medium sticky left-0 bg-white dark:bg-slate-800/90 z-10 whitespace-nowrap"><div className="flex items-center gap-2"><span>{u.username}</span><span className="text-xs text-gray-400 dark:text-slate-500">({u.role})</span></div></td>{SETTINGS_MODULES.map((m) => { const isOverride = u.override_modules?.includes(m.key) ?? false; const hasAccess = u.modules?.includes(m.key) ?? false; const isAdminRole = u.role === "superadmin"; return (<td key={m.key} className="px-2 py-3 text-center"><button onClick={() => { if (isAdminRole) return; toggleModule(u.id, m.key, isOverride); }} className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${isAdminRole ? "bg-gray-100 dark:bg-slate-700/30 text-slate-600 cursor-not-allowed" : isOverride ? "bg-green-600 text-white shadow shadow-green-600/30 hover:bg-green-700" : hasAccess ? "bg-blue-600/60 text-blue-200 hover:bg-blue-600" : "bg-slate-600/40 text-gray-400 dark:text-slate-500 hover:bg-slate-600/70"}`}>{hasAccess ? "✓" : ""}</button></td>); })}</tr>))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* SMTP Tab */}
          {activeTab === "smtp" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">SMTP Configuration</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Konfigurasi server email untuk notifikasi</p>
              </div>
              <Card title="SMTP Server" action={<Toggle value={smtp.smtp_enabled} onChange={() => setSmtp({ ...smtp, smtp_enabled: smtp.smtp_enabled === "true" ? "false" : "true" })} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InputField label="SMTP Host" value={smtp.smtp_host} onChange={(v) => setSmtp({ ...smtp, smtp_host: v })} placeholder="smtp.gmail.com" />
                  <InputField label="SMTP Port" value={smtp.smtp_port} onChange={(v) => setSmtp({ ...smtp, smtp_port: v })} placeholder="587" />
                  <InputField label="Username" value={smtp.smtp_username} onChange={(v) => setSmtp({ ...smtp, smtp_username: v })} placeholder="email@domain.com" />
                  <PasswordField label="Password" value={smtp.smtp_password} onChange={(v) => setSmtp({ ...smtp, smtp_password: v })} placeholder="App password" />
                  <InputField label="From Email" value={smtp.smtp_from_email} onChange={(v) => setSmtp({ ...smtp, smtp_from_email: v })} placeholder="noreply@domain.com" />
                  <InputField label="From Name" value={smtp.smtp_from_name} onChange={(v) => setSmtp({ ...smtp, smtp_from_name: v })} placeholder="Super Apps" />
                </div>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                  <div className="flex items-center gap-3"><span className="text-sm text-gray-700 dark:text-slate-300">Use TLS/STARTTLS</span><Toggle value={smtp.smtp_use_tls} onChange={() => setSmtp({ ...smtp, smtp_use_tls: smtp.smtp_use_tls === "true" ? "false" : "true" })} /></div>
                  <button onClick={saveSMTP} disabled={smtpSaving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{smtpSaving ? "Saving..." : "Simpan"}</button>
                </div>
              </Card>
              <Card title="Test Email">
                <div className="flex gap-3">
                  <input value={smtpTestEmail} onChange={(e) => setSmtpTestEmail(e.target.value)} placeholder="Email tujuan untuk test" className="flex-1 px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none" />
                  <button onClick={testSMTP} disabled={smtpTesting} className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 whitespace-nowrap">{smtpTesting ? "Sending..." : "Kirim Test"}</button>
                </div>
              </Card>
              <Card title="Allowed SMTP Hosts" description="Daftar host SMTP yang diizinkan (comma-separated). Kosongkan untuk memblokir semua pengiriman email.">
                <textarea
                  value={allowedSmtpHosts}
                  onChange={(e) => setAllowedSmtpHosts(e.target.value)}
                  placeholder="smtp.gmail.com, smtp.office365.com, mail.yourcompany.com"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none font-mono"
                />
                <div className="flex justify-end mt-4">
                  <button
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await apiRequest("/api/settings/security", {
                          method: "PUT",
                          body: JSON.stringify({ allowed_smtp_hosts: allowedSmtpHosts }),
                        });
                        setMessage("Allowed SMTP hosts berhasil disimpan");
                      } catch (err: any) {
                        setMessage(err.message || "Gagal menyimpan");
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                    className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Simpan Allowlist"}
                  </button>
                </div>
              </Card>
            </div>
          )}

          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">General Settings</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Pengaturan umum aplikasi</p>
              </div>
              <Card title="Application">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InputField label="App Name" value={general.app_name} onChange={(v) => setGeneral({ ...general, app_name: v })} placeholder="Super Apps" />
                  <InputField label="Timezone" value={general.timezone} onChange={(v) => setGeneral({ ...general, timezone: v })} placeholder="Asia/Jakarta" />
                  <InputField label="Date Format" value={general.date_format} onChange={(v) => setGeneral({ ...general, date_format: v })} placeholder="DD/MM/YYYY" />
                  <div>
                    <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">Language</label>
                    <select value={general.language} onChange={(e) => setGeneral({ ...general, language: e.target.value })} className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none">
                      <option value="id">Bahasa Indonesia</option><option value="en">English</option>
                    </select>
                  </div>
                  <div>
                    <InputField label="Session Timeout (minutes)" value={general.session_timeout} onChange={(v) => setGeneral({ ...general, session_timeout: v })} placeholder="1440" />
                    <p className="text-xs text-amber-400/80 mt-1.5">ISO 27001:2022 recommends 15 minutes for systems with admin functions. Current: {general.session_timeout} min.</p>
                  </div>
                </div>
                <div className="flex justify-end mt-5 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                  <button onClick={() => saveCategory("general", general)} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
                </div>
              </Card>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Security Settings</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Kebijakan password dan keamanan login</p>
              </div>
              <Card title="Password Policy">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InputField label="Min Password Length" value={security.min_password_length} onChange={(v) => setSecurity({ ...security, min_password_length: v })} />
                  <InputField label="Password Expiry (days, 0 = never)" value={security.password_expiry_days} onChange={(v) => setSecurity({ ...security, password_expiry_days: v })} />
                  <InputField label="Max Login Attempts" value={security.max_login_attempts} onChange={(v) => setSecurity({ ...security, max_login_attempts: v })} />
                  <InputField label="Lockout Duration (minutes)" value={security.lockout_duration_minutes} onChange={(v) => setSecurity({ ...security, lockout_duration_minutes: v })} />
                </div>
              </Card>
              <Card title="Requirements">
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-700 dark:text-slate-300">Require Uppercase Letters</span><Toggle value={security.require_uppercase} onChange={() => setSecurity({ ...security, require_uppercase: security.require_uppercase === "true" ? "false" : "true" })} /></div>
                  <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-slate-700/50"><span className="text-sm text-gray-700 dark:text-slate-300">Require Numbers</span><Toggle value={security.require_numbers} onChange={() => setSecurity({ ...security, require_numbers: security.require_numbers === "true" ? "false" : "true" })} /></div>
                  <div className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-slate-700/50"><span className="text-sm text-gray-700 dark:text-slate-300">Require Special Characters</span><Toggle value={security.require_special_chars} onChange={() => setSecurity({ ...security, require_special_chars: security.require_special_chars === "true" ? "false" : "true" })} /></div>
                </div>
               </Card>
                {isAdmin && (
                  <Card title="Email OTP" description="Enable/disable Email OTP for all users system-wide (admin only)">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm text-gray-700 dark:text-slate-300 font-medium">System-wide OTP</span>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">When enabled, all users must verify via email OTP during login</p>
                      </div>
                      <Toggle value={security.otp_enabled} onChange={() => setSecurity({ ...security, otp_enabled: security.otp_enabled === "true" ? "false" : "true" })} />
                    </div>
                  </Card>
                )}
              <div className="flex justify-end pt-2">
                <button onClick={() => saveCategory("security", security)} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
              </div>
             </div>
          )}

          {/* Notification Tab */}
          {activeTab === "notification" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Notification Settings</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Atur notifikasi email untuk berbagai event</p>
              </div>
              <Card title="Email Alerts">
                <div className="space-y-1">
                  {[
                    { key: "incident_email" as const, label: "Incident Reports" },
                    { key: "vulnerability_email" as const, label: "Vulnerability Reports" },
                    { key: "backup_failure_email" as const, label: "Backup Failures" },
                    { key: "task_due_email" as const, label: "Task Due Reminders" },
                    { key: "weekly_report_email" as const, label: "Weekly Report" },
                  ].map((item, i) => (
                    <div key={item.key} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-gray-200 dark:border-slate-700/50" : ""}`}>
                      <span className="text-sm text-gray-700 dark:text-slate-300">{item.label}</span>
                      <Toggle value={notification[item.key]} onChange={() => setNotification({ ...notification, [item.key]: notification[item.key] === "true" ? "false" : "true" })} />
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Recipients">
                <InputField label="Alert Recipients (comma-separated emails)" value={notification.alert_recipients} onChange={(v) => setNotification({ ...notification, alert_recipients: v })} placeholder="admin@domain.com, manager@domain.com" />
                <div className="flex justify-end mt-5 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                  <button onClick={() => saveCategory("notification", notification)} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
                </div>
              </Card>
            </div>
          )}

          {/* API Tab */}
          {activeTab === "api" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">API & Integrations</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Kelola API keys dan webhook</p>
              </div>
              <Card title="API Keys">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <InputField label="Primary API Key" value={api.api_key_primary} onChange={(v) => setApi({ ...api, api_key_primary: v })} placeholder="sk-..." />
                  <InputField label="Secondary API Key" value={api.api_key_secondary} onChange={(v) => setApi({ ...api, api_key_secondary: v })} placeholder="sk-..." />
                </div>
              </Card>
              <Card title="Webhook" action={<Toggle value={api.webhook_enabled} onChange={() => setApi({ ...api, webhook_enabled: api.webhook_enabled === "true" ? "false" : "true" })} />}>
                <InputField label="Webhook URL" value={api.webhook_url} onChange={(v) => setApi({ ...api, webhook_url: v })} placeholder="https://hooks.example.com/webhook/..." />
                <div className="flex justify-end mt-5 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                  <button onClick={() => saveCategory("api", api)} disabled={saving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">{saving ? "Saving..." : "Simpan"}</button>
                </div>
              </Card>
            </div>
          )}

          {/* Backup Tab */}
          {activeTab === "backup" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Backup & Restore</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Backup dan restore database SQLite</p>
              </div>
              <Card title="Backup Database" description="Buat backup database saat ini">
                <button onClick={doBackup} disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">{saving ? "Creating..." : "Backup Sekarang"}</button>
              </Card>
              <Card title="Restore dari File" description="Upload file .db atau .tar.gz untuk di-restore">
                <div className="flex flex-col gap-3">
                  <input
                    type="file"
                    accept=".db,.tar.gz"
                    onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                  />
                  <button onClick={doUploadRestore} disabled={!restoreFile || restoring} className="px-5 py-2.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed self-start">
                    {restoring ? "Merestore..." : "Upload & Restore"}
                  </button>
                </div>
              </Card>
              <Card title={`Backup History (${backups.length})`}>
                {backups.length === 0 && <p className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">Belum ada backup.</p>}
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div key={b.filename} className="flex items-center justify-between p-4 bg-gray-100 dark:bg-slate-700/30 rounded-lg border border-gray-200 dark:border-slate-700/50">
                      <div>
                        <div className="text-sm text-gray-900 dark:text-slate-100 font-medium">{b.filename}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{b.size_mb} MB — {new Date(b.created_at).toLocaleString("id-ID")}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => doDownloadBackup(b.filename)} className="px-4 py-2 bg-blue-600/80 text-white text-xs rounded-lg hover:bg-blue-600 font-medium">Download</button>
                        <button onClick={() => doRestore(b.filename)} className="px-4 py-2 bg-yellow-600/80 text-white text-xs rounded-lg hover:bg-yellow-600 font-medium">Restore</button>
                        <button onClick={() => doDeleteBackup(b.filename)} className="px-4 py-2 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Admin UI Tab */}
          {activeTab === "admin-ui" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Admin UI (sqlite-web)</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Kelola password dan status Admin UI database</p>
              </div>

              <Card title="Status">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${adminUI.url ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                  <span className="text-sm text-gray-700 dark:text-slate-300">{adminUI.url ? "Running" : "Stopped"}</span>
                  {adminUI.url && (
                    <a href="/admin-ui" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline">
                      Buka Admin UI &rarr;
                    </a>
                  )}
                </div>
              </Card>

              <Card title="Change Password" description="Ganti password Admin UI. Password minimal 8 karakter dengan huruf besar, kecil, dan angka.">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-500 dark:text-slate-400 mb-1.5 block font-medium">New Password</label>
                    <div className="relative">
                      <input
                        type={showAdminUIPassword ? "text" : "password"}
                        value={adminUIPassword}
                        onChange={(e) => { setAdminUIPassword(e.target.value); checkPasswordStrength(e.target.value); }}
                        placeholder="Masukkan password baru"
                        className="w-full px-3.5 py-2.5 pr-10 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminUIPassword(!showAdminUIPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:text-slate-200 transition-colors"
                        title={showAdminUIPassword ? "Hide" : "Show"}
                      >
                        {showAdminUIPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    </div>
                    {adminUIPassword && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${passwordStrength.score <= 2 ? "bg-red-500" : passwordStrength.score <= 4 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${passwordStrength.color}`}>{passwordStrength.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveAdminUI} disabled={adminUISaving} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                      {adminUISaving ? "Saving & Restarting..." : "Save & Restart"}
                    </button>
                    <button onClick={restartAdminUI} disabled={adminUIRestarting} className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                      {adminUIRestarting ? "Restarting..." : "Restart Only"}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* System Health Tab */}
          {activeTab === "system-health" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">System Health</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Monitoring dan error logs (auto-refresh 30 detik)</p>
              </div>

              {/* Metrics Cards */}
              {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Uptime</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">
                      {Math.floor(metrics.uptime_seconds / 3600)}j {Math.floor((metrics.uptime_seconds % 3600) / 60)}m
                    </div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Active Sessions</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">{metrics.active_sessions}</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Database Size</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">{metrics.database_size_mb} MB</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Backups</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">{metrics.backup_count}</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Total Users</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">{metrics.total_users}</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Errors (24h)</div>
                    <div className={`text-lg font-bold mt-1 ${metrics.error_count_24h > 0 ? "text-red-500" : "text-green-500"}`}>{metrics.error_count_24h}</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Disk Usage</div>
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-gray-900 dark:text-slate-100">{metrics.disk_usage_percent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${metrics.disk_usage_percent > 90 ? "bg-red-500" : metrics.disk_usage_percent > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${metrics.disk_usage_percent}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700/50">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">Memory Usage</div>
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-gray-900 dark:text-slate-100">{metrics.memory_usage_percent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${metrics.memory_usage_percent > 90 ? "bg-red-500" : metrics.memory_usage_percent > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${metrics.memory_usage_percent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Logs */}
              <Card title={`Error Logs (${errorLogTotal})`}>
                <div className="flex flex-wrap gap-3 mb-4">
                  <select value={errorLogLevel} onChange={(e) => { setErrorLogLevel(e.target.value); setErrorLogPage(1); }} className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50">
                    <option value="">All Levels</option>
                    <option value="ERROR">ERROR</option>
                    <option value="WARNING">WARNING</option>
                    <option value="INFO">INFO</option>
                  </select>
                  <select value={errorLogDays} onChange={(e) => { setErrorLogDays(Number(e.target.value)); setErrorLogPage(1); }} className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100 rounded-lg text-sm border border-gray-300 dark:border-slate-600/50">
                    <option value={1}>24 jam</option>
                    <option value={7}>7 hari</option>
                    <option value={30}>30 hari</option>
                  </select>
                  <button onClick={purgeErrorLogs} className="px-3 py-1.5 bg-red-600/80 text-white text-xs rounded-lg hover:bg-red-600 font-medium">Hapus &gt;30 hari</button>
                </div>
                {errorLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">Tidak ada error logs.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-700/50">
                          <th className="pb-2 pr-3">Level</th>
                          <th className="pb-2 pr-3">Message</th>
                          <th className="pb-2 pr-3 hidden md:table-cell">Path</th>
                          <th className="pb-2 pr-3 hidden sm:table-cell">Source</th>
                          <th className="pb-2 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorLogs.map((e: any) => (
                          <tr key={e.id} className="border-b border-gray-100 dark:border-slate-700/30 hover:bg-gray-50 dark:hover:bg-slate-700/20">
                            <td className="py-2 pr-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                e.level === "ERROR" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                                e.level === "WARNING" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" :
                                "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              }`}>{e.level}</span>
                            </td>
                            <td className="py-2 pr-3 text-gray-900 dark:text-slate-100 max-w-xs truncate">{e.message}</td>
                            <td className="py-2 pr-3 text-gray-500 dark:text-slate-400 hidden md:table-cell max-w-[200px] truncate font-mono text-xs">{e.request_path || "-"}</td>
                            <td className="py-2 pr-3 text-gray-500 dark:text-slate-400 hidden sm:table-cell text-xs">{e.source}</td>
                            <td className="py-2 text-right text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString("id-ID")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {errorLogTotal > 50 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setErrorLogPage(Math.max(1, errorLogPage - 1))} disabled={errorLogPage === 1} className="px-3 py-1 text-xs bg-gray-100 dark:bg-slate-700/60 rounded-lg disabled:opacity-50">Previous</button>
                    <span className="px-3 py-1 text-xs text-gray-500 dark:text-slate-400">Page {errorLogPage} of {Math.ceil(errorLogTotal / 50)}</span>
                    <button onClick={() => setErrorLogPage(errorLogPage + 1)} disabled={errorLogPage >= Math.ceil(errorLogTotal / 50)} className="px-3 py-1 text-xs bg-gray-100 dark:bg-slate-700/60 rounded-lg disabled:opacity-50">Next</button>
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === "sessions" && <SessionManagementTab />}
          {activeTab === "asset-metadata" && <AssetMetadataTab />}
          {activeTab === "retention" && <RetentionTab />}
          {activeTab === "ai-audit" && <AiAuditTab />}
        </div>
      </div>
    </div>
  );
}
