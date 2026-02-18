'use client';

import { QueryClientProvider, QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
        queryCache: new QueryCache({
          onError: (error) => {
            console.error('Query error:', error);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            console.error('Mutation error:', error);
          },
        }),
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Re-export for convenience
export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
