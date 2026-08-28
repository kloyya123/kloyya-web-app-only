/**
 * Client Composio utilisant l'API v3 officielle.
 * Récupère d'abord l'auth_config_id, puis crée le lien de connexion.
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

/**
 * 1. Récupère l'ID de la configuration d'authentification (auth_config_id) pour une app donnée.
 */
async function getAuthConfigId(apiKey: string, appName: string): Promise<string> {
  const res = await fetch(`${COMPOSIO_BASE_URL}/auth_configs?appName=${appName}`, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch auth configs: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  const configs = data.items || data.data || [];
  
  // On prend la première config disponible pour cette app (généralement celle gérée par Composio)
  const config = configs.find((c: any) => c.appName === appName) || configs[0];
  
  if (!config || !config.id) {
    throw new Error(`No auth config found for app: ${appName}. Please create one in Composio dashboard.`);
  }

  return config.id;
}

/**
 * 2. Initie la connexion OAuth en utilisant l'auth_config_id et le user_id.
 */
export async function initiateComposioConnection(
  appName: string,
  userId: string,
  redirectUri: string
): Promise<{ redirectUrl: string; connectedAccountId: string | null }> {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  // Étape A : Obtenir l'auth_config_id
  const authConfigId = await getAuthConfigId(apiKey, appName);

  // Étape B : Créer le lien de session d'authentification (endpoint v3)
  const res = await fetch(`${COMPOSIO_BASE_URL}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: userId,
      redirect_uri: redirectUri,
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
