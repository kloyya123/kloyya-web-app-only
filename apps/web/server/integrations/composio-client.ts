/**
 * Client Composio utilisant l'API v3 officielle.
 * Documentation : https://docs.composio.dev/api-reference/
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

interface ComposioApp {
  id: string;
  key: string;
  name: string;
}

interface ComposioIntegration {
  id: string;
  appId: string;
  name: string;
}

interface ComposioConnection {
  redirectUrl: string;
  connectedAccountId: string | null;
}

/**
 * Vérifie que la clé API Composio est valide en appelant un endpoint v3.
 */
async function verifyApiKey(apiKey: string): Promise<void> {
  const res = await fetch(`${COMPOSIO_BASE_URL}/apps`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Invalid Composio API key: HTTP ${res.status} - ${errorText}`);
  }
}

/**
 * Récupère ou crée une intégration pour l'application donnée.
 */
async function getOrCreateIntegration(
  apiKey: string,
  appName: string
): Promise<ComposioIntegration> {
  // 1. Lister les intégrations existantes
  const listRes = await fetch(`${COMPOSIO_BASE_URL}/integrations`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listRes.ok) {
    const errorText = await listRes.text();
    throw new Error(`Failed to list integrations: HTTP ${listRes.status} - ${errorText}`);
  }

  const listData = await listRes.json();
  const items = listData.items || listData.data || [];
  let integration = items.find((i: any) => i.appKey === appName || i.appId === appName);

  // 2. Si aucune intégration n'existe, en créer une
  if (!integration) {
    const createRes = await fetch(`${COMPOSIO_BASE_URL}/integrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${appName} Integration`,
        appKey: appName, // v3 utilise appKey
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Failed to create integration: HTTP ${createRes.status} - ${errorText}`);
    }

    integration = await createRes.json();
  }

  return integration;
}

/**
 * Initie une connexion OAuth pour l'intégration donnée.
 */
export async function initiateComposioConnection(
  appName: string,
  entityId: string,
  redirectUrl: string
): Promise<ComposioConnection> {
  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  // 1. Vérifier la clé
  await verifyApiKey(apikKey);

  // 2. Obtenir ou créer l'intégration
  const integration = await getOrCreateIntegration(apiKey, appName);

  // 3. Initier la connexion OAuth (v3 endpoint)
  const connectRes = await fetch(`${COMPOSIO_BASE_URL}/connectedAccounts/initiate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      integrationId: integration.id,
      entityId,
      redirectUrl,
    }),
  });

  if (!connectRes.ok) {
    const errorText = await connectRes.text();
    throw new Error(`Failed to initiate connection: HTTP ${connectRes.status} - ${errorText}`);
  }

  const connectionData = await connectRes.json();

  return {
    redirectUrl: connectionData.redirectUrl,
    connectedAccountId: connectionData.connectedAccountId || connectionData.id || null,
  };
}
