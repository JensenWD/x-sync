'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn, compactAge } from '@/lib/utils';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import type { Bookmark } from '@/types';

export function PostAvatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name?.slice(0, 2).toUpperCase() || '??';

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-[#8d8d95] font-bold text-background select-none',
          className,
        )}
      >
        {initials}
      </div>
    );
  }
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-full', className)}>
      <Image
        src={src}
        alt={name}
        fill
        sizes="48px"
        className="object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** First image plus a "+N" marker — the card teases media, the reader shows it all. */
export function PostMedia({ urls, className }: { urls: string[]; className?: string }) {
  if (urls.length === 0) return null;
  return (
    <div className={cn('relative w-full overflow-hidden rounded-[10px] bg-[#16161a] md:rounded-[8px]', className)}>
      <Image
        src={urls[0]}
        alt="Post media"
        fill
        className="object-cover"
        unoptimized
        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
      />
      {urls.length > 1 && (
        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
          +{urls.length - 1}
        </span>
      )}
    </div>
  );
}

/**
 * 2a / 3a post card. Deliberately chrome-free: the whole card opens the reader,
 * which is where every action on a post lives.
 */
export function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const { folderId, tags, setFolder, toggleTag, openPost } = useLibraryFilters();
  const age = bookmark.bookmarked_at ? compactAge(bookmark.bookmarked_at) : null;
  const primaryFolder = bookmark.folders[0] ?? null;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open post by ${bookmark.author_name}`}
      onClick={() => openPost(bookmark.id)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openPost(bookmark.id);
      }}
      className={cn(
        'flex cursor-pointer flex-col gap-[13px] rounded-[14px] border border-card-border bg-card p-[18px] md:gap-3.5 md:rounded-[12px] md:p-5',
        'transition-colors duration-150 hover:border-card-border-hover hover:bg-card-hover',
        'focus-visible:border-card-border-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      <div className="flex items-center gap-2.5">
        <PostAvatar
          src={bookmark.author_avatar}
          name={bookmark.author_name}
          className="size-8 text-[11px] md:size-7"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-medium text-text-primary md:text-[13px]">
            {bookmark.author_name}
          </span>
          <span className="truncate text-[12px] text-muted-foreground md:text-[11px]">
            @{bookmark.author_handle}
          </span>
        </div>
        {age && <span className="shrink-0 text-[12px] text-text-faint md:text-[11px]">{age}</span>}
      </div>

      <p className="line-clamp-[14] font-serif text-[19px] leading-[1.5] whitespace-pre-wrap text-[#d6d6da] md:text-[18px]">
        {bookmark.full_text}
      </p>

      {bookmark.quoted_tweet && (
        <div className="rounded-lg border border-card-border bg-[#101012] p-3">
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="truncate text-[12px] font-medium text-text-secondary">
              {bookmark.quoted_tweet.author_name}
            </span>
            <span className="truncate font-mono text-[11px] text-text-faint">
              @{bookmark.quoted_tweet.author_handle}
            </span>
          </div>
          <p className="line-clamp-3 font-serif text-[15px] leading-[1.5] text-[#9a9aa0]">
            {bookmark.quoted_tweet.full_text}
          </p>
        </div>
      )}

      <PostMedia urls={bookmark.media_urls ?? []} className="h-[180px] md:h-[170px]" />

      {(bookmark.folders.length > 0 || bookmark.tags.length > 0) && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          {primaryFolder && (
            <button
              type="button"
              onClick={() =>
                setFolder(folderId === primaryFolder.id ? null : primaryFolder.id)
              }
              className="flex items-center gap-1.5 text-[12px] text-text-secondary transition-colors hover:text-text-primary md:text-[11px]"
            >
              <span
                className="size-1 rounded-full"
                style={{ backgroundColor: primaryFolder.color ?? '#5c5c62' }}
              />
              {primaryFolder.name}
            </button>
          )}
          {bookmark.tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.name)}
              className={cn(
                'rounded-[5px] px-[7px] py-[3px] font-mono text-[11px] transition-colors md:text-[10px]',
                tags.includes(tag.name)
                  ? 'bg-chip-active text-chip-active-foreground'
                  : 'bg-chip text-text-tertiary hover:bg-chip-active hover:text-chip-active-foreground',
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
