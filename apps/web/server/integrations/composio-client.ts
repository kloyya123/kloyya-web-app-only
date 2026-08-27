import { Composio } from 'composio-core';

let client: Composio | undefined;

/**
 * Client Composio serveur.
 *
 * La clé API est uniquement lue au runtime depuis
 * COMPOSIO_API_KEY.
 */
export function getComposioClient(): Composio {
  if (client) {
    return client;
  }

  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error(
      'COMPOSIO_API_KEY is missing. Configure it in Vercel Environment Variables.',
    );
  }

  client = new Composio({
    apiKey,
  });

  return client;
}
