/**
 * Client Composio utilisant l'API v3 officielle.
 * Supporte désormais la redirection automatique après succès.
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export function getComposioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  return {
    connectedAccounts: {
      async link(userId: string, authConfigId: string, redirectUri?: string) {
        const payload: any = {
          user_id: userId,
          auth_config_id: authConfigId,
        };

        // Ajoute l'URL de callback si fournie (le champ API v3 s'appelle "callback_url", pas "redirect_uri")
        if (redirectUri) {
          payload.callback_url = redirectUri;
        }

        const res = await fetch(`${COMPOSIO_BASE_URL}/connected_accounts/link`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Composio API error: HTTP ${res.status} - ${errorText}`);
        }

        const data = await res.json();

        // Gestion robuste des différents formats de réponse
        const finalRedirectUrl = 
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

        if (!finalRedirectUrl) {
          throw new Error(`Composio returned no redirect URL. Response: ${JSON.stringify(data)}`);
        }

        return {
          redirectUrl: finalRedirectUrl,
          connectedAccountId,
        };
      },
    },
  };
}
