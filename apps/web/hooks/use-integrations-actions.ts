'use client';

import { useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

export function useIntegrationsActions() {
  const qc = useQueryClient();

  async function connect(id: string) {
    try {
      // In the real OAuth flow this may redirect the browser.
      // The callback page refreshes the integration cache when the user returns.
      await services.integrations.connect(id);

      void qc.invalidateQueries({
        queryKey: ['integrations', 'summary'],
      });

      void qc.invalidateQueries({
        queryKey: ['integrations', id],
      });
    } catch (error) {
      console.error('Connect integration error', error);
      throw error;
    }
  }

  async function disconnect(id: string) {
    try {
      await services.integrations.disconnect(id);

      void qc.invalidateQueries({
        queryKey: ['integrations', 'summary'],
      });

      void qc.invalidateQueries({
        queryKey: ['integrations', id],
      });
    } catch (error) {
      console.error('Disconnect integration error', error);
      throw error;
    }
  }

  return {
    connect,
    disconnect,
  };
}
