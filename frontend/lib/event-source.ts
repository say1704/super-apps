/**
 * SSE Client - Wrapper for Server-Sent Events with auto-reconnect
 * Uses fetch + ReadableStream so the token travels via Authorization header
 * (EventSource does not support custom headers and forces the token into the URL).
 */

type EventHandler = (data: any) => void;

export class SSEClient {
  private controller: AbortController | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private url: string;
  private token: string;
  private closed = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async connect() {
    if (this.closed) return;

    const controller = new AbortController();
    this.controller = controller;

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      this.reconnectAttempts = 0;
      this.emit('open', null);

      const readLoop = async (): Promise<void> => {
        try {
          while (!this.closed) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              const rawEvent = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              this.dispatchEvent(rawEvent);
            }
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          throw err;
        }
      };

      await readLoop();
    } catch (err: any) {
      if (this.closed) return;
      console.log('[SSE] Connection lost', err?.message);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
      }
    }
  }

  private dispatchEvent(rawEvent: string) {
    const lines = rawEvent.split('\n');
    let eventName = 'message';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
    }
    if (!dataStr) return;
    try {
      this.emit(eventName, JSON.parse(dataStr));
    } catch (e) {
      // Ignore parse errors
    }
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      this.handlers.set(event, handlers.filter(h => h !== handler));
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(h => {
      try {
        h(data);
      } catch (e) {
        console.error(`[SSE] Error in handler for ${event}:`, e);
      }
    });
  }

  close() {
    this.closed = true;
    this.controller?.abort();
    this.controller = null;
  }
}
