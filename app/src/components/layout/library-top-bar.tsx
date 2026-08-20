'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, XIcon } from 'lucide-react';
import { SyncDialog } from '@/components/sync/sync-dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { useSyncStatus, useXConnection } from '@/hooks/use-sync';
import { cn, compactAge } from '@/lib/utils';

/** Keeps the input responsive while the URL (and query) trail behind it. */
function useSearchField() {
  const { search, setSearch } = useLibraryFilters();
  const [value, setValue] = useState(search);
  const debounced = useDebounce(value, 250);
  const settled = useRef(search);

  useEffect(() => {
    if (debounced === settled.current) return;
    settled.current = debounced;
    setSearch(debounced);
  }, [debounced, setSearch]);

  // Pull in changes made elsewhere (clear filters, a shared link, back/forward).
  useEffect(() => {
    if (search === settled.current) return;
    settled.current = search;
    setValue(search);
  }, [search]);

  return { value, setValue };
}

export function LibraryTopBar() {
  const searchParams = useSearchParams();
  // The OAuth callback returns here with a result to show.
  const [syncOpen, setSyncOpen] = useState(
    () => searchParams.has('x_connected') || searchParams.has('x_error'),
  );
  const { value, setValue } = useSearchField();
  const { data: syncStatus } = useSyncStatus();
  const { data: connection } = useXConnection();
  const desktopInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        desktopInput.current?.focus();
        desktopInput.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const total = syncStatus?.total_bookmarks;
  const placeholder = total
    ? `Search ${total.toLocaleString()} saved posts`
    : 'Search saved posts';
  const syncing = Boolean(syncStatus?.in_progress);
  const age = syncStatus?.last_synced_at ? compactAge(syncStatus.last_synced_at) : null;
  const avatarInitial = connection?.username?.[0]?.toUpperCase() ?? null;

  const syncLabel = syncing ? 'Syncing…' : age ? `Synced ${age}` : 'Never synced';

  const account = (
    <button
      type="button"
      onClick={() => setSyncOpen(true)}
      title="Sync bookmarks"
      className="flex items-center gap-3 text-text-secondary transition-colors hover:text-text-primary md:gap-[18px] md:text-text-tertiary"
    >
      {syncing && <Loader2 className="size-3.5 animate-spin" />}
      <span className="hidden text-[13px] md:inline">{syncLabel}</span>
      <span className="font-mono text-[11px] text-muted-foreground md:hidden">{age ?? '—'}</span>
      <span className="flex size-8 items-center justify-center rounded-full bg-[#232326] text-[11px] font-medium text-text-secondary md:size-[26px] md:text-[10px]">
        {avatarInitial}
      </span>
    </button>
  );

  const clearButton = (
    <button
      type="button"
      onClick={() => setValue('')}
      aria-label="Clear search"
      className="text-muted-foreground transition-colors hover:text-text-primary"
    >
      <XIcon className="size-3.5" />
    </button>
  );

  return (
    <>
      {/* Desktop — 2a: title left, search centred, account right. */}
      <div className="hidden items-center gap-7 border-b border-hairline px-8 py-3 md:flex">
        <span className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text-primary">
          Saved
        </span>
        <div className="flex flex-1 justify-center">
          <label
            className={cn(
              'flex w-[460px] items-center gap-[9px] rounded-full border border-input-border bg-input px-3.5 py-[7px]',
              'transition-colors focus-within:border-[#3a3a41]',
            )}
          >
            <span className="size-[5px] shrink-0 rounded-full bg-[#5c5c62]" />
            <input
              ref={desktopInput}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setValue('')}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-[#75757b]"
            />
            {value ? clearButton : <span className="font-mono text-[11px] text-text-faint">⌘K</span>}
          </label>
        </div>
        {account}
      </div>

      {/* Mobile — 3a: stacked title row, then a full-width search field. */}
      <div className="px-5 pt-3 md:hidden">
        <div className="flex items-center justify-between">
          <span className="font-serif text-[23px] leading-none tracking-[-0.01em] text-text-primary">
            Saved
          </span>
          {account}
        </div>
        <label className="mt-2.5 flex h-10 items-center gap-2.5 rounded-[10px] border border-input-border bg-input px-3.5">
          <span className="size-[5px] shrink-0 rounded-full bg-[#5c5c62]" />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-text-primary outline-none placeholder:text-[#75757b]"
          />
          {value ? clearButton : null}
        </label>
      </div>

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </>
  );
}
