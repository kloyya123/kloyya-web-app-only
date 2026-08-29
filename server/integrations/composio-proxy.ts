import { getApiKey } from './composio-client';
import { GoogleTransientError } from './google-http';

const COMPOSIO_PROXY_URL = 'https://backend.composio.dev/api/v3.1/tools/execute/proxy';

interface ProxyResponseBody {
  data?: unknown;
  status?: number;
  headers?: Record<string, string>;
  error?: string;
}

/**
 * A `fetch`-compatible function that routes a request through a Composio
 * connected account instead of calling the provider directly with a bearer
 * token.
 *
 * Every native connector (gmail.ts, google-calendar.ts, google-drive.ts,
 * slack-client.ts, notion-client.ts) already accepts a pluggable `fetchImpl` —
 * this is that seam. The URL, method, and JSON response shape they expect are
 * unchanged; only *how* the call is authenticated changes. Composio injects
 * the real OAuth token for `connectedAccountId` server-side — Kloyya never
 * holds or refreshes it for a Composio-managed connection.
 */
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
      // Composio itself refused the call (bad account id, quota, its own
      // outage) — not the upstream provider. Treated as transient, the same
      // way a Google 5xx would be: retried, not a dead connection.
      throw new GoogleTransientError(
        `Composio proxy request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as ProxyResponseBody;
    const upstreamStatus = body.status ?? 200;

    // Reconstruct a standard Response so google-http.ts's existing status
    // handling (410 expired cursor, 429/5xx transient, 404, ...) works
    // exactly as it does for a direct call.
    return new Response(JSON.stringify(body.data ?? {}), {
      status: upstreamStatus,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}
