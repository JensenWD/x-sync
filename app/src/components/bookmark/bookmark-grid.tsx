'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  SearchIcon,
  XIcon,
  SlidersHorizontalIcon,
  BookmarkXIcon,
  Loader2,
  CalendarIcon,
  CheckIcon,
} from 'lucide-react';
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
import { BulkActionBar } from './bulk-action-bar';
import { SelectionProvider, useSelection } from './selection-context';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useFolders } from '@/hooks/use-folders';
import { useDebounce } from '@/hooks/use-debounce';

const SORT_LABELS: Record<string, string> = {
  bookmarked_at_desc: 'Newest first',
  bookmarked_at_asc: 'Oldest first',
  like_count_desc: 'Most liked',
  author_asc: 'Author A–Z',
};

const DATE_RANGES: Array<{ id: string; label: string; days: number | null }> = [
  { id: 'all', label: 'All time', days: null },
  { id: '1d', label: 'Today', days: 1 },
  { id: '7d', label: 'Past 7 days', days: 7 },
  { id: '30d', label: 'Past 30 days', days: 30 },
  { id: '90d', label: 'Past 3 months', days: 90 },
  { id: '365d', label: 'Past year', days: 365 },
];

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseIntList(value: string | null): number[] {
  return parseList(value)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function BookmarkGridInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { clear: clearSelection } = useSelection();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  const folderIds = useMemo(() => parseIntList(searchParams.get('folder_id')), [searchParams]);
  const activeTags = useMemo(() => parseList(searchParams.get('tag')), [searchParams]);
  const untagged = searchParams.get('untagged') === '1';
  const sort = searchParams.get('sort') || 'bookmarked_at_desc';
  const rangeId = searchParams.get('range') || 'all';
  const range = DATE_RANGES.find((r) => r.id === rangeId) ?? DATE_RANGES[0];

  const { data: folders = [] } = useFolders();
  const activeFolders = folders.filter((f) => folderIds.includes(f.id));

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  function removeFromList(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    const values = parseList(next.get(key)).filter((v) => v !== value);
    if (values.length === 0) next.delete(key);
    else next.set(key, values.join(','));
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
    folder_ids: folderIds,
    tag_names: activeTags,
    untagged,
    range_days: range.days,
    sort,
    per_page: 40,
  });

  const bookmarks = Array.from(
    new Map((data?.pages.flatMap((p) => p.data) ?? []).map((b) => [b.id, b])).values(),
  );
  const total = data?.pages[0]?.meta.total;

  // Clear selection whenever the filter set changes — selected ids may not exist
  // in the new result set.
  const folderKey = folderIds.join(',');
  const tagKey = activeTags.join(',');
  useEffect(() => {
    clearSelection();
  }, [debouncedSearch, folderKey, tagKey, untagged, rangeId, sort, clearSelection]);

  // Esc clears selection (and only selection — search/filters keep their state)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clearSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection]);

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

  const hasFilters =
    !!debouncedSearch ||
    folderIds.length > 0 ||
    activeTags.length > 0 ||
    untagged ||
    rangeId !== 'all';

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
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#1d9bf0] flex items-center justify-center hover:bg-[#1a8cd8]"
                  >
                    <XIcon className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
              </div>

              {/* Date range */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-full border border-[var(--card-border)] text-[var(--text-secondary)] text-[13px] bg-transparent hover:bg-[#1a1a1a] transition-colors shrink-0 whitespace-nowrap"
                  title={`Filter by bookmark date — ${range.label}`}
                  aria-label={`Date range: ${range.label}`}
                >
                  <CalendarIcon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{range.label}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a1a1a] border-[var(--card-border)] rounded-xl">
                  {DATE_RANGES.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => setParam('range', r.id === 'all' ? null : r.id)}
                      className={`text-[15px] cursor-pointer flex items-center gap-2 ${
                        rangeId === r.id ? 'text-[#1d9bf0]' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {rangeId === r.id ? (
                        <CheckIcon className="w-3.5 h-3.5" />
                      ) : (
                        <span className="w-3.5 h-3.5" />
                      )}
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-full border border-[var(--card-border)] text-[var(--text-secondary)] text-[13px] bg-transparent hover:bg-[#1a1a1a] transition-colors shrink-0 whitespace-nowrap"
                  title={`Sort — ${SORT_LABELS[sort]}`}
                  aria-label={`Sort: ${SORT_LABELS[sort]}`}
                >
                  <SlidersHorizontalIcon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1a1a1a] border-[var(--card-border)] rounded-xl">
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => setParam('sort', value)}
                      className={`text-[15px] cursor-pointer ${
                        sort === value ? 'text-[#1d9bf0]' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Active filter chips */}
            {hasFilters && (
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
                {untagged && (
                  <Badge
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => setParam('untagged', null)}
                  >
                    Untagged
                    <XIcon className="w-3.5 h-3.5" />
                  </Badge>
                )}
                {activeFolders.map((f) => (
                  <Badge
                    key={f.id}
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => removeFromList('folder_id', String(f.id))}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: f.color ?? '#71767b' }}
                    />
                    {f.name}
                    <XIcon className="w-3.5 h-3.5" />
                  </Badge>
                ))}
                {activeTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => removeFromList('tag', tag)}
                  >
                    #{tag}
                    <XIcon className="w-3.5 h-3.5" />
                  </Badge>
                ))}
                {rangeId !== 'all' && (
                  <Badge
                    variant="secondary"
                    className="text-[13px] gap-1.5 cursor-pointer hover:bg-[#2a2a2a] rounded-full px-3 py-1 whitespace-nowrap"
                    onClick={() => setParam('range', null)}
                  >
                    <CalendarIcon className="w-3 h-3" />
                    {range.label}
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
        <div
          className="max-w-[640px] mx-auto px-4 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 7rem)' }}
        >
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-card ring-1 ring-white/10 px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.55)]"
                >
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
                {hasFilters
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

      <BulkActionBar />
    </div>
  );
}

export function BookmarkGrid() {
  return (
    <SelectionProvider>
      <BookmarkGridInner />
    </SelectionProvider>
  );
}
