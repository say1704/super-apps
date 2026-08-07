import { useEffect, useRef, useCallback, useState } from 'react';
import { SSEClient } from '@/lib/event-source';
import { useAuth, apiRequest } from '@/lib/auth';

const SSE_BASE = '/api/proxy/sse/api/v1';

interface RealtimeEvent {
  event: string;
  data: any;
  timestamp: number;
}

export function useRealtimeEvents(handlers: Record<string, (data: any) => void>) {
  const { token } = useAuth();
  const clientRef = useRef<SSEClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  const fetchOnlineUsers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest('/api/online-users');
      setOnlineUsers(data.users || []);
    } catch (err) {
      // Silently ignore - backend may be restarting
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const client = new SSEClient(`${SSE_BASE}/events/stream`, token);
    clientRef.current = client;

    client.on('connected', () => {
      setIsConnected(true);
      fetchOnlineUsers();
    });

    client.on('message', (event: RealtimeEvent) => {
      const handler = handlers[event.event];
      if (handler) {
        handler(event.data);
      }
      // Refresh online users on any user presence event
      if (event.event === 'user_online' || event.event === 'user_offline') {
        fetchOnlineUsers();
      }
    });

    client.connect();

    // Periodically refresh online users
    const interval = setInterval(fetchOnlineUsers, 30000);

    return () => {
      clearInterval(interval);
      client.close();
      setIsConnected(false);
    };
  }, [token, fetchOnlineUsers]);

  return { isConnected, onlineUsers };
}
