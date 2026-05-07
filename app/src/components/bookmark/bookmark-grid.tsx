'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState, useCallback, useEffect, useRef } from 'react';
import { SearchIcon, XIcon, SlidersHorizontalIcon, BookmarkXIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { BookmarkCard } from './bookmark-card';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useFolders } from '@/hooks/use-folders';
import { useDebounce } from '@/hooks/use-debounce';

const SORT_LABELS: Record<string, string> = {
  bookmarked_at_desc: 'Newest first',
  bookmarked_at_asc: 'Oldest first',
  like_count_desc: 'Most liked',
  author_asc: 'Author A–Z',
};

export function BookmarkGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  const folderId = searchParams.get('folder_id') ? parseInt(searchParams.get('folder_id')!, 10) : null;
  const activeTag = searchParams.get('tag');
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';

  const { data: folders = [] } = useFolders();
  const activeFolder = folderId ? folders.find((f) => f.id === folderId) : null;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  const updateSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set('search', value);
      else next.delete('search');
      router.push(`${pathname}?${next.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useBookmarks({
    search: debouncedSearch || undefined,
    folder_id: folderId,
    tag: activeTag,
    sort,
    per_page: 40,
  });

  const bookmarks = Array.from(
    new Map((data?.pages.flatMap((p) => p.data) ?? []).map((b) => [b.id, b])).values()
  );
  const total = data?.pages[0]?.meta.total;

  // IntersectionObserver — trigger next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
        <div className="max-w-[640px] mx-auto">
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                <Input
                  value={searchInput}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder="Search bookmarks"
                  className="pl-10 h-[42px] text-[15px] bg-[#202327] border-transparent rounded-full focus:border-[#1d9bf0] focus:bg-transparent"
                />
                {searchInput && (
                  <button
                    onClick={() => updateSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#1d9bf0] flex items-center justify-center hover:bg-[#1a8cd8]"
                  >
                    <XIcon className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[var(--card-border)] text-[var(--text-secondary)] text-[13px] bg-transparent hover:bg-[#1a1a1a] transition-colors shrink-0 whitespace-nowrap"
                >
                  <SlidersHorizontalIcon className="w-4 h-4 shrink-0" />
                  {SORT_LABELS[sort]}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a1a1a] border-[var(--card-border)] rounded-xl">
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setParam('sort', value)}
                      className={`text-[15px] cursor-pointer ${sort === value ? 'text-[#1d9bf0]' : 'text-[var(--text-primary)]'}`}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Active filter chips */}
            {(folderId || activeTag || debouncedSearch) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {debouncedSearch && (
                  <Badge
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 max-w-[260px]"
                    onClick={() => updateSearch('')}
                  >
                    <span className="truncate">&ldquo;{debouncedSearch}&rdquo;</span>
                    <XIcon className="w-3.5 h-3.5 shrink-0" />
                  </Badge>
                )}
                {activeFolder && (
                  <Badge
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => setParam('folder_id', null)}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeFolder.color ?? '#71767b' }}
                    />
                    {activeFolder.name}
                    <XIcon className="w-3.5 h-3.5" />
                  </Badge>
                )}
                {activeTag && (
                  <Badge
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => setParam('tag', null)}
                  >
                    #{activeTag}
                    <XIcon className="w-3.5 h-3.5" />
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="border-b border-white/20" />
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-card ring-1 ring-white/10 px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.55)]">
                  <div className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full bg-[#2a2a2a]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 bg-[#2a2a2a]" />
                      <Skeleton className="h-3 w-full bg-[#2a2a2a]" />
                      <Skeleton className="h-3 w-3/4 bg-[#2a2a2a]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <BookmarkXIcon className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-[var(--text-secondary)] text-[15px]">
                {debouncedSearch || folderId || activeTag
                  ? 'No bookmarks match your filters'
                  : 'No bookmarks yet — sync from the extension'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookmarks.map((bookmark) => (
                <BookmarkCard key={bookmark.id} bookmark={bookmark} />
              ))}

              {/* Sentinel — triggers next page load */}
              <div ref={sentinelRef} className="h-px" />

              {isFetchingNextPage && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-secondary)]" />
                </div>
              )}

              {!hasNextPage && total !== undefined && total > 0 && (
                <p className="text-center text-[12px] text-[var(--text-secondary)] py-6 font-mono">
                  {total} bookmarks
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
