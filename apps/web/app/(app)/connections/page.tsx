'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

/**
 * Page that handles the OAuth provider redirect back to the app.
 *
 * Expected query params:
 * - status: connected, error, syncing, etc.
 * - providerId, provider, or id: the integration identifier
 *
 * Behavior:
 * - Invalidates the global integrations summary so dashboard/widgets
 *   receive fresh connection data.
 * - Invalidates the specific provider query when available.
 * - Polls the provider connection status while the backend is syncing.
 * - Redirects to /connections once the connection becomes active.
 */
export default function ConnectionsCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const status = params.get('status');
    const providerId =
      params.get('providerId') ||
      params.get('provider') ||
      params.get('id');

    let cancelled = false;
    let redirectTimeout: ReturnType<typeof setTimeout> | undefined;

    const invalidateIntegrationQueries = () => {
      void queryClient.invalidateQueries({
        queryKey: ['integrations', 'summary'],
      });

      if (providerId) {
        void queryClient.invalidateQueries({
          queryKey: ['integrations', providerId],
        });
      }
    };

    // Always refresh integration data when returning from OAuth.
    invalidateIntegrationQueries();

    if (!status) {
      setMessage(
        'Retour reçu : état inconnu. Vérification de la connexion...'
      );
    } else if (status === 'connected') {
      setMessage(
        'Connexion réussie — synchronisation en cours. Mise à jour des widgets...'
      );
    } else if (status === 'error') {
      setMessage(
        'La connexion a échoué. Veuillez réessayer ou vérifier l’accès.'
      );
    } else {
      setMessage(`Statut : ${status}. Mise à jour en cours...`);
    }

    /**
     * Wait without relying on any TypeScript/ESLint suppression.
     */
    const sleep = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });

    /**
     * Poll the connection until the backend reports that it is connected.
     *
     * The backend may temporarily report statuses such as:
     * - syncing
     * - paused
     * - not_connected
     *
     * We give it up to 12 attempts with a 2-second delay between attempts.
     */
    async function pollUntilConnected() {
      if (!providerId) {
        return;
      }

      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        try {
          const connection =
            await services.integrations.getConnection(providerId);

          if (cancelled) {
            return;
          }

          // Keep the global integration summary synchronized.
          void queryClient.invalidateQueries({
            queryKey: ['integrations', 'summary'],
          });

          if (connection.status === 'connected') {
            setMessage(
              'La connexion est maintenant active. Redirection vers les sources...'
            );

            redirectTimeout = setTimeout(() => {
              if (!cancelled) {
                router.push('/connections');
              }
            }, 900);

            return;
          }

          if (connection.status === 'error') {
            setMessage(
              'La connexion est en erreur après tentative. Voir la page des connexions.'
            );
            return;
          }

          setMessage(
            `Statut actuel : ${connection.status}. Attente de la synchronisation...`
          );
        } catch (error) {
          console.error('Polling connection error', error);
        }

        if (!cancelled && attempt < 11) {
          await sleep(2000);
        }
      }

      if (!cancelled) {
        setMessage(
          'La synchronisation prend plus de temps que prévu. Vous pouvez consulter la page des connexions.'
        );
      }
    }

    void pollUntilConnected();

    return () => {
      cancelled = true;

      if (redirectTimeout) {
        clearTimeout(redirectTimeout);
      }
    };
  }, [params, queryClient, router]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">
        Finalisation de la connexion
      </h1>

      <p className="mt-3 text-sm text-muted-foreground">
        {message ?? 'Traitement...'}
      </p>

      <div className="mt-6">
        <a
          href="/connections"
          className="text-sm text-primary underline"
        >
          Aller à la liste des connexions
        </a>
      </div>
    </div>
  );
}
