import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

/**
 * Hook that exposes integration actions (connect/disconnect/forceSync/reconnect).
 * UI components should call this hook rather than importing services directly.
 */
export function useIntegrationsActions() {
  const qc = useQueryClient();

  const connect = useCallback(async (id: string) => {
    try {
      // Real flow will navigate to provider and this promise may never resolve in
      // the browser. That's expected. Mock resolves and we then refresh cache.
      await services.integrations.connect(id);
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', id]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Integration connect failed', error);
      throw error;
    }
  }, [qc]);

  const disconnect = useCallback(async (id: string) => {
    try {
      await services.integrations.disconnect(id);
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', id]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Integration disconnect failed', error);
      throw error;
    }
  }, [qc]);

  const forceSync = useCallback(async (id: string) => {
    try {
      await services.integrations.forceSync(id);
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', id]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Integration forceSync failed', error);
      throw error;
    }
  }, [qc]);

  const reconnect = useCallback(async (id: string) => {
    try {
      await services.integrations.reconnect(id);
      qc.invalidateQueries(['integrations', 'summary']);
      qc.invalidateQueries(['integrations', id]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Integration reconnect failed', error);
      throw error;
    }
  }, [qc]);

  return { connect, disconnect, forceSync, reconnect };
}
