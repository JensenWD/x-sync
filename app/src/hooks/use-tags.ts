import { useQuery } from '@tanstack/react-query';
import type { Tag } from '@/types';

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => fetch('/api/tags').then((r) => r.json()),
  });
}
