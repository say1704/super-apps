export interface NavItem {
  name: string;
  href: string;
  icon: string;
  key: string;
  keywords?: string[];
  submenu?: { name: string; href: string; keywords?: string[] }[];
}

export const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: "📊", key: "dashboard", keywords: ["home", "main", "overview"] },
  {
    name: "Infrastructure",
    href: "/modules/infrastructure",
    icon: "🖥️",
    key: "infrastructure",
    keywords: ["server", "capacity", "sar", "irmc"],
    submenu: [
      { name: "Server Capacity", href: "/modules/monthly-server-check", keywords: ["sar", "cpu", "ram", "disk", "monitoring"] },
      { name: "IRMC Checks", href: "/modules/irmc", keywords: ["irmc", "screenshot", "folder"] },
    ],
  },
  {
    name: "Security & Compliance",
    href: "/modules/security-compliance",
    icon: "🔒",
    key: "security-compliance",
    keywords: ["security", "compliance", "vulnerability", "incident", "risk", "quality"],
    submenu: [
      { name: "Vulnerability Report", href: "/modules/vulnerability", keywords: ["nessus", "scan", "security"] },
      { name: "Incident Report", href: "/modules/incident", keywords: ["outage", "issue", "incident"] },
      { name: "Risk Assessment", href: "/modules/risk", keywords: ["risk", "threat", "impact", "isms"] },
      { name: "Quality Objectives", href: "/modules/quality", keywords: ["quality", "sla", "kpi", "objective"] },
      { name: "Audit File", href: "/modules/audit", keywords: ["audit", "file", "integrity", "monitoring"] },
    ],
  },
  { name: "Asset Management", href: "/modules/assets", icon: "📦", key: "assets", keywords: ["hardware", "software", "inventory", "server", "vm", "asset"] },
  {
    name: "Operations",
    href: "/modules/operations",
    icon: "📝",
    key: "operations",
    keywords: ["worklog", "tasks", "documentation", "forms", "operations"],
    submenu: [
      { name: "Worklog", href: "/modules/worklog", keywords: ["work", "log", "daily", "activity"] },
      { name: "Project Tasks", href: "/modules/tasks", keywords: ["task", "scrum", "sprint", "kanban"] },
      { name: "Document Library", href: "/modules/documentation", keywords: ["document", "sop", "knowledge", "wiki"] },
      { name: "Form Uploads", href: "/modules/forms", keywords: ["form", "change", "destruction", "upload"] },
    ],
  },
  {
    name: "Log Management",
    href: "/modules/log-management",
    icon: "📋",
    key: "log-management",
    keywords: ["logs", "maintenance", "deletion", "compression"],
    submenu: [
      { name: "Log Deletion", href: "/modules/log-deletion", keywords: ["delete", "cleanup", "maintenance"] },
      { name: "Log Compression", href: "/modules/log-compression", keywords: ["compress", "archive"] },
    ],
  },
  {
    name: "Backup Management",
    href: "/modules/backup-management",
    icon: "💾",
    key: "backup-management",
    keywords: ["backup", "analytics", "verify"],
    submenu: [
      { name: "Backup Check", href: "/modules/backup-check", keywords: ["backup", "verify", "check"] },
      { name: "Backup Analytics", href: "/modules/backup-analytics", keywords: ["analytics", "charts", "graphs", "ml"] },
    ],
  },
  { name: "Activity Logs", href: "/modules/activity", icon: "📜", key: "activity", keywords: ["audit", "log", "history", "tracker"] },
  { name: "Notifications", href: "/modules/notifications", icon: "🔔", key: "notifications", keywords: ["notification", "alert", "message"] },
  { name: "Settings", href: "/modules/settings", icon: "⚙️", key: "settings", keywords: ["config", "user", "role", "preference"] },
  { name: "Profile", href: "/profile", icon: "👤", key: "profile", keywords: ["profile", "account", "password", "2fa"] },
];

export function flattenNavigation(): { name: string; href: string; icon: string; keywords: string; section?: string }[] {
  const result: { name: string; href: string; icon: string; keywords: string; section?: string }[] = [];
  for (const item of navigation) {
    result.push({
      name: item.name,
      href: item.href,
      icon: item.icon,
      keywords: [...(item.keywords || []), item.name].join(" "),
    });
    if (item.submenu) {
      for (const sub of item.submenu) {
        result.push({
          name: sub.name,
          href: sub.href,
          icon: item.icon,
          keywords: [...(sub.keywords || []), sub.name, item.name].join(" "),
          section: item.name,
        });
      }
    }
  }
  return result;
}
