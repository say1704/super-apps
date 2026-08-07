import { useEffect, useRef, useState, useCallback } from 'react';
import { SSEClient } from '@/lib/event-source';
import { useAuth, apiRequest } from '@/lib/auth';

const SSE_BASE = '/api/proxy/sse/api/v1';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
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
      // Silently ignore
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

    client.on('message', (event: any) => {
      if (event.event === 'user_online' || event.event === 'user_offline') {
        fetchOnlineUsers();
      }
    });

    client.connect();

    const interval = setInterval(fetchOnlineUsers, 30000);

    return () => {
      clearInterval(interval);
      client.close();
      setIsConnected(false);
    };
  }, [token, fetchOnlineUsers]);

  return (
    <>
      {children}
      <div id="realtime-status" data-connected={isConnected} data-online-count={onlineUsers.length} style={{ display: 'none' }} />
    </>
  );
}
