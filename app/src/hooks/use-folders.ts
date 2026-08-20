import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Folder } from '@/types';
import { fetchJson } from '@/lib/http/fetch-json';

export function useFolders() {
  return useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: () => fetchJson<Folder[]>('/api/folders'),
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      fetchJson<Folder>('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color?: string }) =>
      fetchJson<Folder>(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/api/folders/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useAddToFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, bookmarkId }: { folderId: number; bookmarkId: number }) =>
      fetchJson(`/api/folders/${folderId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmark_ids: [bookmarkId] }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}

export function useRemoveFromFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, bookmarkId }: { folderId: number; bookmarkId: number }) =>
      fetchJson(`/api/folders/${folderId}/bookmarks?bookmark_id=${bookmarkId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}
