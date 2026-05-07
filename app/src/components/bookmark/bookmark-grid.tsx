'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';
import { SearchIcon, XIcon, SlidersHorizontalIcon, BookmarkXIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { useDebounce } from '@/hooks/use-debounce';

const SORT_LABELS: Record<string, string> = {
  bookmarked_at_desc: 'Newest first',
  bookmarked_at_asc: 'Oldest first',
  author_asc: 'Author A–Z',
};

export function BookmarkGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  const folderId = searchParams.get('folder_id') ? parseInt(searchParams.get('folder_id')!, 10) : null;
  const activeTag = searchParams.get('tag');
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';
  const page = parseInt(searchParams.get('page') || '1', 10);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.set('page', '1');
    router.push(`${pathname}?${next.toString()}`);
  }

  const updateSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set('search', value);
      else next.delete('search');
      next.set('page', '1');
      router.push(`${pathname}?${next.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const { data, isLoading, isFetching } = useBookmarks({
    search: debouncedSearch || undefined,
    folder_id: folderId,
    tag: activeTag,
    sort,
    page,
    per_page: 40,
  });

  const bookmarks = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3 space-y-2">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search bookmarks…"
              className="pl-9 h-8 text-sm bg-secondary border-transparent focus:border-[#1d9bf0] font-mono"
            />
            {searchInput && (
              <button
                onClick={() => updateSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text-primary"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-text-secondary text-xs bg-transparent hover:bg-secondary transition-colors"
            >
              <SlidersHorizontalIcon className="w-3.5 h-3.5" />
              {SORT_LABELS[sort]}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-popover border-border">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setParam('sort', value)}
                  className={`text-sm cursor-pointer ${sort === value ? 'text-[#1d9bf0]' : 'text-text-primary'}`}
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
                className="text-xs gap-1 cursor-pointer hover:bg-muted"
                onClick={() => updateSearch('')}
              >
                &ldquo;{debouncedSearch}&rdquo;
                <XIcon className="w-3 h-3" />
              </Badge>
            )}
            {folderId && (
              <Badge
                variant="secondary"
                className="text-xs gap-1 cursor-pointer hover:bg-muted"
                onClick={() => setParam('folder_id', null)}
              >
                Folder
                <XIcon className="w-3 h-3" />
              </Badge>
            )}
            {activeTag && (
              <Badge
                variant="secondary"
                className="text-xs gap-1 cursor-pointer hover:bg-muted"
                onClick={() => setParam('tag', null)}
              >
                #{activeTag}
                <XIcon className="w-3 h-3" />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-lg bg-card" />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BookmarkXIcon className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-text-secondary text-sm">
              {debouncedSearch || folderId || activeTag
                ? 'No bookmarks match your filters'
                : 'No bookmarks yet — sync from the extension'}
            </p>
          </div>
        ) : (
          <>
            <div
              className={`grid gap-4 grid-cols-1 xl:grid-cols-2 ${
                isFetching ? 'opacity-75 transition-opacity' : ''
              }`}
            >
              {bookmarks.map((bookmark) => (
                <BookmarkCard key={bookmark.id} bookmark={bookmark} />
              ))}
            </div>

            {/* Pagination */}
            {meta && meta.last_page > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                <span className="text-xs font-mono text-muted-foreground">
                  Page {meta.current_page} of {meta.last_page} · {meta.total} bookmarks
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-border"
                    disabled={meta.current_page <= 1}
                    onClick={() => setParam('page', String(meta.current_page - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-border"
                    disabled={meta.current_page >= meta.last_page}
                    onClick={() => setParam('page', String(meta.current_page + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
