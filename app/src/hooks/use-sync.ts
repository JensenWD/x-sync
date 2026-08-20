import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncRun, SyncStatus, XConnectionStatus } from '@/types';

export interface ReconciliationConfirmation {
  fingerprint: string;
  observed_count: number;
}

interface SyncErrorDetails {
  baseline_count: number;
  observed_count: number;
  archive_count: number;
  reconciliation_confirmation: ReconciliationConfirmation;
}

export class SyncRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly details: SyncErrorDetails | null,
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

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
  return useMutation<
    SyncRun,
    SyncRequestError,
    { mode: 'incremental' | 'full'; reconciliation_confirmation?: ReconciliationConfirmation }
  >({
    mutationFn: async ({ mode, reconciliation_confirmation }) => {
      const response = await fetch('/api/x/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'official', mode, reconciliation_confirmation }),
      });
      const result = await response.json().catch(() => null) as {
        code?: string;
        details?: SyncErrorDetails;
        error?: string;
        run?: SyncRun;
      } | null;
      if (!response.ok || !result?.run) {
        throw new SyncRequestError(
          result?.error ?? 'X bookmark sync failed.',
          result?.code ?? null,
          result?.details ?? null,
        );
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
