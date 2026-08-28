import { useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { ConnectionSummary } from '@/types/integrations';

/**
 * Centralized hook returning the integrations summary.
 * Use this in dashboard / ask / widgets so they share a single cache key.
 */
export function useIntegrationsSummary() {
  const queryClient = useQueryClient();
  const query = useQuery<ConnectionSummary>(
    ['integrations', 'summary'],
    () => services.integrations.getSummary(),
    {
      staleTime: 30_000,
      // Do not refetch on window focus automatically for UX control,
      // prefer explicit invalidation after user actions or OAuth callback.
      refetchOnWindowFocus: false,
    },
  );

  return {
    ...query,
    refresh: () => queryClient.invalidateQueries(['integrations', 'summary']),
  };
}
