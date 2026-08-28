/**
 * Client Composio utilisant l'API REST directement (sans SDK déprécié).
 * Plus fiable et plus simple à déboguer.
 */

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v1';

export async function initiateComposioConnection(
  appName: string,
  entityId: string,
  redirectUrl: string
): Promise<{ redirectUrl: string; connectedAccountId: string | null }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured in environment variables');
  }

  // 1. Vérifier que la clé API est valide
  const testRes = await fetch(`${COMPOSIO_BASE_URL}/apps`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!testRes.ok) {
    const errorText = await testRes.text();
    throw new Error(`Invalid Composio API key: HTTP ${testRes.status} - ${errorText}`);
  }

  // 2. Chercher si une intégration existe déjà pour cette app
  const integrationsRes = await fetch(`${COMPOSIO_BASE_URL}/integrations`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!integrationsRes.ok) {
    const errorText = await integrationsRes.text();
    throw new Error(`Failed to list integrations: HTTP ${integrationsRes.status} - ${errorText}`);
  }

  const integrationsData = await integrationsRes.json();
  let integration = integrationsData.items?.find((i: any) => i.appUniqueId === appName);

  // 3. Si aucune intégration n'existe, en créer une
  if (!integration) {
    const createRes = await fetch(`${COMPOSIO_BASE_URL}/integrations`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${appName} Integration`,
        appUniqueId: appName,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Failed to create integration: HTTP ${createRes.status} - ${errorText}`);
    }

    integration = await createRes.json();
  }

  // 4. Initier la connexion OAuth
  const connectRes = await fetch(`${COMPOSIO_BASE_URL}/connectedAccounts/integration`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
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
    connectedAccountId: connectionData.connectedAccountId || null,
  };
}
