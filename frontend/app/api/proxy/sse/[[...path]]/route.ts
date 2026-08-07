import { NextRequest } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';

const REJECT_UNAUTHORIZED = process.env.REJECT_UNAUTHORIZED !== 'false';

const dispatcher = new Agent({
  connect: {
    rejectUnauthorized: REJECT_UNAUTHORIZED,
  },
});

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://127.0.0.1:8001';

export async function GET(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/api\/proxy\/sse/, '');
  const url = `${BACKEND_URL}${path}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  try {
    const response = await undiciFetch(url, {
      method: 'GET',
      headers,
      dispatcher,
    });

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    return new Response(response.body as any, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Backend connection failed', detail: error.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
