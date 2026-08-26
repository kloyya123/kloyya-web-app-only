import { Composio } from 'composio-core';

/**
 * Initialisation différée (Lazy Loading) du client Composio.
 * Cela empêche le SDK de planter pendant le build Vercel si la variable 
 * d'environnement n'est pas encore disponible. Elle sera évaluée au runtime.
 */
export function getComposioClient() {
  return new Composio({
    // La clé réelle sera injectée par Vercel au runtime. 
    // La valeur 'dummy' est juste un filet de sécurité pour éviter le crash au build.
    apiKey: process.env.COMPOSIO_API_KEY || 'dummy-key-to-prevent-build-crash',
  });
}
