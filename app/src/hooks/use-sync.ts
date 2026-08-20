import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncRun, SyncStatus, XConnectionStatus } from '@/types';

export function useSyncStatus() {
  const queryClient = useQueryClient();
  const previousSuccessfulSync = useRef<number | null | undefined>(undefined);
  const query = useQuery<SyncStatus>({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const response = await fetch('/api/sync/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load sync status');
      return response.json();
    },
    refetchInterval: (current) => (current.state.data?.in_progress ? 2000 : 10_000),
  });

  useEffect(() => {
    const completedAt = query.data?.last_synced_at;
    if (
      previousSuccessfulSync.current !== undefined &&
      completedAt &&
      completedAt !== previousSuccessfulSync.current
    ) {
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    }
    previousSuccessfulSync.current = completedAt;
  }, [query.data?.last_synced_at, queryClient]);

  return query;
}

export function useXConnection() {
  return useQuery<XConnectionStatus>({
    queryKey: ['x-connection'],
    queryFn: async () => {
      const response = await fetch('/api/x/oauth/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load X connection status');
      return response.json();
    },
  });
}

export function useOfficialSync() {
  const queryClient = useQueryClient();
  return useMutation<SyncRun, Error, 'incremental' | 'full'>({
    mutationFn: async (mode) => {
      const response = await fetch('/api/x/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'official', mode }),
      });
      const result = await response.json().catch(() => null) as {
        error?: string;
        run?: SyncRun;
      } | null;
      if (!response.ok || !result?.run) {
        throw new Error(result?.error ?? 'X bookmark sync failed.');
      }
      return result.run;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sync-status'] }),
        queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
      ]);
    },
  });
}
