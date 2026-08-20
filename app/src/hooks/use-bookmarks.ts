import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Bookmark, BookmarksResponse } from '@/types';
import { fetchJson } from '@/lib/http/fetch-json';

interface BookmarkFilters {
  search?: string;
  folder_id?: number | null;
  tags?: string[];
  tag_mode?: 'all' | 'any';
  sort?: string;
  per_page?: number;
  page?: number;
}

export function useBookmarks(filters: BookmarkFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.folder_id) params.set('folder_id', String(filters.folder_id));
  if (filters.tags?.length) {
    params.set('tags', filters.tags.join(','));
    if (filters.tag_mode) params.set('tag_mode', filters.tag_mode);
  }
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.per_page) params.set('per_page', String(filters.per_page));
  if (filters.page) params.set('page', String(filters.page));

  return useQuery<BookmarksResponse>({
    queryKey: ['bookmarks', params.toString()],
    queryFn: () => fetchJson<BookmarksResponse>(`/api/bookmarks?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useBookmark(id: number | null) {
  return useQuery<Bookmark>({
    queryKey: ['bookmark', id],
    queryFn: () => fetchJson<Bookmark>(`/api/bookmarks/${id}`),
    enabled: id !== null,
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchJson(`/api/bookmarks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmark'] });
    },
  });
}

export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookmarkId, name }: { bookmarkId: number; name: string }) =>
      fetchJson(`/api/bookmarks/${bookmarkId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmark'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookmarkId, tagId }: { bookmarkId: number; tagId: number }) =>
      fetchJson(`/api/bookmarks/${bookmarkId}/tags?tag_id=${tagId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmark'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
