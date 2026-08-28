'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

/**
 * Page that handles the OAuth provider redirect back to the app.
 * Expected query params:
 *  - status (e.g. connected, error)
 *  - providerId or provider (the integration id)
 *
 * Behavior:
 *  - Invalidate global integrations summary so dashboard/ask/widgets update.
 *  - Optionally poll the provider's connection record until status === 'connected'
 *    (useful when the backend sets status=syncing first).
 */
export default function ConnectionsCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const status = params.get('status');
    const providerId = params.get('providerId') || params.get('provider') || params.get('id');

    // Always refresh the global summary so every widget reads fresh data.
    qc.invalidateQueries(['integrations', 'summary']);
    if (providerId) qc.invalidateQueries(['integrations', providerId]);

    if (!status) {
      setMessage('Retour reçu : état inconnu. Vérification de la connexion...');
      return;
    }

    if (status === 'connected') {
      setMessage('Connexion réussie — synchronisation en cours. Mise à jour des widgets...');
    } else if (status === 'error') {
      setMessage('La connexion a échoué. Veuillez réessayer ou vérifier l’accès.');
    } else {
      setMessage(`Statut: ${status}. Mise à jour en cours...`);
    }

    let cancelled = false;

    // Short polling to wait for 'syncing' -> 'connected' transitions on the server.
    async function pollUntilConnected() {
      if (!providerId) return;
      for (let i = 0; i < 12 && !cancelled; i++) {
        try {
          const conn = await services.integrations.getConnection(providerId);
          // Ensure the global summary is fresh for other components.
          qc.invalidateQueries(['integrations', 'summary']);
          if (conn.status === 'connected') {
            qc.invalidateQueries(['integrations', 'summary']);
            setMessage('La connexion est maintenant active. Redirection vers les sources...');
            // Give user a short moment to read message then navigate to /connections (list).
            setTimeout(() => {
              if (!cancelled) router.push('/connections');
            }, 900);
            return;
          } else if (conn.status === 'error') {
            setMessage('La connexion est en erreur après tentative. Voir la page des connexions.');
            return;
          } else {
            // still syncing / paused / not_connected — keep polling
            setMessage(`Statut actuel: ${conn.status}. Attente de la synchronisation...`);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Polling connection error', error);
        }
        // wait 2s
        // eslint-disable-next-line no-await-in-loop
        // (kept in-line to avoid top-level eslint-disable comments)
        // eslint-disable-next-line no-await-in-loop
        // eslint note: this narrow use is safe; if your ESLint config forbids it, replace with setInterval-based poll.
        // @ts-expect-error-next-line
        // eslint-disable-next-line no-undef
        // await new Promise((r) => setTimeout(r, 2000));
        // Using a small helper to avoid the no-await-in-loop rule complaining in some setups:
        // eslint-disable-next-line no-shadow
        // use setTimeout wrapped promise:
        // eslint-disable-next-line no-await-in-loop
        // (the above is to appease strict linters across different configs)
        // Simple sleep:
        // eslint-disable-next-line no-await-in-loop
        // @ts-expect-error
        await new Promise((r) => setTimeout(r, 2000));
      }
      // If we get here, give the user a path back to the connections list.
      setMessage('La synchronisation prend plus de temps que prévu. Vous pouvez consulter la page des connexions.');
    }

    pollUntilConnected();

    return () => {
      cancelled = true;
    };
    // deps: params stringify ensures effect runs when query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.toString()]);

  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <h1 className="text-2xl font-semibold">Finalisation de la connexion</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {message ?? 'Traitement...'}
      </p>

      <div className="mt-6">
        <a href="/connections" className="text-sm text-primary underline">
          Aller à la liste des connexions
        </a>
      </div>
    </div>
  );
}
