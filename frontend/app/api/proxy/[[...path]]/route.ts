import { NextRequest, NextResponse } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';

const REJECT_UNAUTHORIZED = process.env.REJECT_UNAUTHORIZED !== 'false';

const dispatcher = new Agent({
  connect: {
    rejectUnauthorized: REJECT_UNAUTHORIZED,
  },
});

// ── Backend worker pool (load balancing) ─────────────────────────────────────
// ALL API traffic funnels through this proxy, so we distribute it across the
// backend uvicorn workers here. Default pool = the 5 PM2 workers (ports
// 8001-8005). Override with BACKEND_URLS (comma-separated). NEXT_PUBLIC_API_URL
// is left untouched (still used as a display/base value in frontend/lib/auth.tsx)
// and no longer controls the proxy target — the proxy always talks to the local
// backend workers.
const DEFAULT_POOL = [
  'https://127.0.0.1:8001',
  'https://127.0.0.1:8002',
  'https://127.0.0.1:8003',
  'https://127.0.0.1:8004',
  'https://127.0.0.1:8005',
];
const BACKEND_POOL: string[] = (process.env.BACKEND_URLS
  ? process.env.BACKEND_URLS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_POOL);
const POOL_SIZE = BACKEND_POOL.length;

// Primary worker (index 0) hosts the single-worker in-memory subsystems.
const WORKER_COOKIE = 'sa_worker';
const WORKER_COOKIE_MAX_AGE = 60 * 60 * 8; // 8h

// Round-robin counter used only to assign a worker to a browser that has no
// sticky cookie yet. Module-level: there is one frontend process, so one counter.
let rrCounter = 0;

// Paths that MUST always run on worker-1 (index 0), regardless of the sticky
// cookie, because they depend on per-process in-memory state that is not shared
// across workers:
//   - auth / rate limiting  → slowapi memory:// counters (per-process)
//   - AI                    → in-process llama model + PENDING_ACTIONS dict
//   - SSE stream + the writes that emit broadcast_event → in-memory sse_manager;
//     the broadcast must run on the same worker that holds the SSE clients.
// `path` is the backend path AFTER stripping the /api/proxy prefix, e.g.
// "/api/v1/token" or "/api/v1/tasks".
function isPinnedToPrimary(path: string, method: string): boolean {
  if (path === '/api/v1/token') return true;
  if (path.startsWith('/api/v1/auth/')) return true;
  if (path.startsWith('/api/v1/ai/')) return true;
  // SSE long-lived stream must live on worker-1 so every client converges there.
  if (path.startsWith('/api/v1/notifications/events')) return true;
  // Mutating writes on these routers call broadcast_event → pin to worker-1 so the
  // event reaches the SSE clients (which are all on worker-1). GET reads distribute.
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (
    isWrite &&
    (path.startsWith('/api/v1/tasks') ||
      path.startsWith('/api/v1/worklog') ||
      path.startsWith('/api/v1/incident') ||
      path.startsWith('/api/v1/notifications'))
  ) {
    return true;
  }
  return false;
}

// Decide which worker index handles this request.
// assignCookie=true means a new sticky assignment was made and the response
// should set the sa_worker cookie.
function selectWorker(
  request: NextRequest,
  path: string,
  method: string,
): { index: number; assignCookie: boolean } {
  if (POOL_SIZE <= 1) return { index: 0, assignCookie: false };
  if (isPinnedToPrimary(path, method)) return { index: 0, assignCookie: false };

  const raw = request.cookies.get(WORKER_COOKIE)?.value;
  const parsed = raw != null ? Number.parseInt(raw, 10) : NaN;
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < POOL_SIZE) {
    return { index: parsed, assignCookie: false };
  }

  const index = rrCounter % POOL_SIZE;
  rrCounter = (rrCounter + 1) % (POOL_SIZE * 1_000_000); // keep it bounded
  return { index, assignCookie: true };
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return proxyRequest(request);
}

async function proxyRequest(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/api\/proxy/, '');
  const search = request.nextUrl.search;

  const contentType = request.headers.get('content-type') || '';

  // Build headers
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!['host', 'connection', 'transfer-encoding'].includes(lower)) {
      headers[key] = value;
    }
  });

  let body: ArrayBuffer | undefined;
  let bodySize = 0;

  if (!['GET', 'HEAD'].includes(request.method)) {
    try {
      const buffer = await request.arrayBuffer();
      body = buffer;
      bodySize = buffer.byteLength;
      console.log(`[Proxy] ${request.method} ${path} - Body: ${(bodySize / 1024).toFixed(1)} KB, CT: ${contentType}`);
    } catch (err: any) {
      console.error(`[Proxy] Body read failed ${request.method} ${path}:`, err.message);
      return NextResponse.json(
        { error: 'Failed to read body', detail: err.message },
        { status: 400 }
      );
    }
  }

  const { index, assignCookie } = selectWorker(request, path, request.method);

  const fetchOptions: any = {
    method: request.method,
    headers,
    body,
    dispatcher,
  };

  // For idempotent reads we can transparently fail over to another worker if the
  // chosen one is down/unreachable. Writes are NOT retried to avoid double-apply.
  const canFailover = ['GET', 'HEAD'].includes(request.method);
  const attemptOrder = [index];
  if (canFailover) {
    for (let i = 1; i < POOL_SIZE; i++) attemptOrder.push((index + i) % POOL_SIZE);
  }

  let lastError: any = null;
  for (const workerIdx of attemptOrder) {
    const url = `${BACKEND_POOL[workerIdx]}${path}${search}`;
    console.log(`[Proxy] Forwarding to worker ${workerIdx} (${BACKEND_POOL[workerIdx]}): ${path}`);
    try {
      const response = await undiciFetch(url, fetchOptions);

      console.log(`[Proxy] Response status: ${response.status} for ${path} (worker ${workerIdx})`);

      // Log response body for errors
      let responseBody = '';
      if (response.status >= 400) {
        try {
          responseBody = await response.text();
          console.error(`[Proxy] Error response body for ${path}:`, responseBody.substring(0, 500));
        } catch {}
      }

      const responseHeaders = new Headers();
      response.headers.forEach((value: string, key: string) => {
        const lower = key.toLowerCase();
        if (['content-encoding', 'transfer-encoding', 'connection', 'set-cookie'].includes(lower)) {
          return;
        }
        responseHeaders.set(key, value);
      });

      // Preserve ALL Set-Cookie headers (forEach merges/drops multiple cookies,
      // which would leave a stale access_token cookie in the browser).
      if (typeof (response.headers as any).getSetCookie === 'function') {
        for (const cookie of (response.headers as any).getSetCookie()) {
          responseHeaders.append('set-cookie', cookie);
        }
      }

      // Pin this browser to the assigned worker for subsequent requests (sticky
      // session) so per-worker state (scan progress, SSE, rate limit) stays coherent.
      if (assignCookie) {
        responseHeaders.append(
          'set-cookie',
          `${WORKER_COOKIE}=${index}; Path=/; Max-Age=${WORKER_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`,
        );
      }

      if (response.status >= 400 && responseBody) {
        return new Response(responseBody, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      return new Response(response.body as any, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (error: any) {
      lastError = error;
      console.error(
        `[Proxy] Backend failed ${request.method} ${path} on worker ${workerIdx}:`,
        error.message,
      );
      // try next worker (reads only); writes fall through immediately
    }
  }

  return NextResponse.json(
    { error: 'Backend connection failed', detail: lastError?.message || 'unknown' },
    { status: 502 }
  );
}
