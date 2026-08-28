/**
 * Client Composio utilisant l'API v3 officielle.
 * Gère plusieurs formats de réponse possibles de l'API.
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export function getComposioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  return {
    connectedAccounts: {
      async link(userId: string, authConfigId: string) {
        const res = await fetch(`${COMPOSIO_BASE_URL}/connected_accounts/link`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            auth_config_id: authConfigId,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Composio API error: HTTP ${res.status} - ${errorText}`);
        }

        const data = await res.json();

        // Log pour voir exactement ce que Composio renvoie
        console.warn('[Composio Link Response]', JSON.stringify(data, null, 2));

        // Gestion de plusieurs formats de réponse possibles
        const redirectUrl = 
          data.redirectUrl || 
          data.redirect_url || 
          data.data?.redirectUrl || 
          data.data?.redirect_url ||
          data.link ||
          data.url;

        const connectedAccountId = 
          data.connectedAccountId || 
          data.connected_account_id ||
          data.data?.connectedAccountId ||
          data.data?.connected_account_id ||
          null;

        if (!redirectUrl) {
          throw new Error(`Composio returned no redirect URL. Response: ${JSON.stringify(data)}`);
        }

        return {
          redirectUrl,
          connectedAccountId,
        };
      },
    },
  };
}
