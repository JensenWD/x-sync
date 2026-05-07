'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={300}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{ style: { background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#e7e9ea' } }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
