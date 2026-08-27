import { Composio } from 'composio-core';

let composioClient: Composio | null = null;

/**
 * Retourne le client Composio uniquement côté serveur.
 *
 * La clé doit obligatoirement être fournie par l'environnement.
 * On ne fournit volontairement aucune fausse clé : une mauvaise
 * configuration doit être détectée immédiatement au runtime.
 */
export function getComposioClient(): Composio {
  if (composioClient) {
    return composioClient;
  }

  const apiKey = process.env.COMPOSIO_API_KEY;

  if (!apiKey) {
    throw new Error(
      'COMPOSIO_API_KEY is not configured. Add it to the Vercel environment variables.',
    );
  }

  composioClient = new Composio({
    apiKey,
  });

  return composioClient;
}
