import { Composio } from 'composio-core';

// Initialisation du client Composio
// Nous utilisons la clé API depuis les variables d'environnement Vercel
export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY || '',
});
