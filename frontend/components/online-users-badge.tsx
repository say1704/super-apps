"use client";

interface OnlineUsersBadgeProps {
  onlineUsers: any[];
  isConnected: boolean;
}

export default function OnlineUsersBadge({ onlineUsers, isConnected }: OnlineUsersBadgeProps) {
  if (!isConnected || onlineUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
      <span>{onlineUsers.length} online</span>
    </div>
  );
}
