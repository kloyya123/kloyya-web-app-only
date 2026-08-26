import { Composio } from 'composio-core';

// Initialisation du client Composio
// Nous utilisons la clé API depuis les variables d'environnement Vercel
export const composio = new Composio(process.env.COMPOSIO_API_KEY || '');
// Export des apps courantes pour une utilisation typée
export const Apps = composio.app;
