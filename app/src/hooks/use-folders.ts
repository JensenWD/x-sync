import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Folder } from '@/types';

export function useFolders() {
  return useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: () => fetch('/api/folders').then((r) => r.json()),
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color?: string }) =>
      fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/folders/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useAddToFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, bookmarkId }: { folderId: number; bookmarkId: number }) =>
      fetch(`/api/folders/${folderId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmark_ids: [bookmarkId] }),
      }).then((r) => r.json()),
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
      fetch(`/api/folders/${folderId}/bookmarks?bookmark_id=${bookmarkId}`, {
        method: 'DELETE',
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}
