/**
 * Client Composio utilisant l'endpoint v3 officiel pour créer un lien de connexion.
 * Documentation : https://docs.composio.dev/reference/v3/api-reference/connected-accounts/postConnectedAccountsLink
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export async function initiateComposioConnection(
  appName: string,
  entityId: string,
  redirectUri: string
): Promise<{ redirectUrl: string; connectedAccountId: string | null }> {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  // Appel direct à l'endpoint v3 "Create a new auth link session"
  const res = await fetch(`${COMPOSIO_BASE_URL}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appName: appName,
      entityId: entityId,
      redirectUri: redirectUri,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Composio API error: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();

  return {
    redirectUrl: data.redirectUrl,
    connectedAccountId: data.connectedAccountId || null,
  };
}
