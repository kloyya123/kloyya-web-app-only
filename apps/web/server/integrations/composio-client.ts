/**
 * Client Composio utilisant l'API v3 officielle.
 * Fournit l'interface attendue par la route d'intégration.
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export function getComposioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  return {
    connectedAccounts: {
      /**
       * Crée un lien de session d'authentification (Composio-managed OAuth)
       * @param userId L'ID de l'utilisateur dans ton système (Supabase)
       * @param authConfigId L'ID de la configuration d'authentification dans Composio
       */
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

        return {
          redirectUrl: data.redirectUrl,
          connectedAccountId: data.connectedAccountId || null,
        };
      },
    },
  };
}
