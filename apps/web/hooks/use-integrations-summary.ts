
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';

/**
 * Centralized hook returning the integrations summary.
 *
 * The response type is inferred directly from services.integrations.getSummary()
 * so this hook stays synchronized with the actual service contract.
 */
export function useIntegrationsSummary() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['integrations', 'summary'],
    queryFn: () => services.integrations.getSummary(),
    staleTime: 30_000,

    // Do not refetch on window focus automatically.
    // Prefer explicit invalidation after user actions or OAuth callbacks.
    refetchOnWindowFocus: false,
  });

  return {
    ...query,

    refresh: () =>
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'summary'],
      }),
  };
}
