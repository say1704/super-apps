export const ALL_SETTINGS_TABS = [
  { key: "users", label: "Users" },
  { key: "pending-approvals", label: "Pending Approvals" },
  { key: "roles", label: "Roles" },
  { key: "modules", label: "Module Access" },
  { key: "smtp", label: "SMTP" },
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "notification", label: "Notification" },
  { key: "api", label: "API & Integrations" },
  { key: "backup", label: "Backup" },
  { key: "admin-ui", label: "Admin UI" },
  { key: "sessions", label: "Sessions" },
  { key: "retention", label: "Data Retention" },
  { key: "ai-audit", label: "AI Audit Trail" },
  { key: "system-health", label: "System Health" },
] as const;

export type SettingsTabKey = typeof ALL_SETTINGS_TABS[number]["key"];

export function getVisibleTabs(userRole: string | undefined, userSettingsTabs: string[] | undefined): SettingsTabKey[] {
  if (userRole === "superadmin") {
    return ALL_SETTINGS_TABS.map((t) => t.key);
  }
  if (userSettingsTabs && userSettingsTabs.length > 0) {
    return userSettingsTabs.filter((tab) =>
      ALL_SETTINGS_TABS.some((t) => t.key === tab)
    ) as SettingsTabKey[];
  }
  return ["general", "sessions"];
}

export function canAccessTab(
  userRole: string | undefined,
  userSettingsTabs: string[] | undefined,
  tabKey: string
): boolean {
  const visibleTabs = getVisibleTabs(userRole, userSettingsTabs);
  return visibleTabs.includes(tabKey as SettingsTabKey);
}
