import { getApiKey } from './composio-client';
import { GoogleTransientError } from './google-http';

const COMPOSIO_PROXY_URL = 'https://backend.composio.dev/api/v3.1/tools/execute/proxy';

interface ProxyResponseBody {
  data?: unknown;
  status?: number;
  headers?: Record<string, string>;
  error?: string;
}

export function getComposioProxyFetch(connectedAccountId: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

    const response = await fetch(COMPOSIO_PROXY_URL, {
      method: 'POST',
      headers: {
        'x-api-key': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connected_account_id: connectedAccountId,
        endpoint: url,
        method,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new GoogleTransientError(
        `Composio proxy request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as ProxyResponseBody;
    const upstreamStatus = body.status ?? 200;

    return new Response(JSON.stringify(body.data ?? {}), {
      status: upstreamStatus,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}
