'use client';

import { memo, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { CheckIcon } from 'lucide-react';
import { cn, compactAge } from '@/lib/utils';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { CardMedia } from './post-media';
import { PostMetrics } from './post-metrics';
import { PostText } from './post-text';
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

/** The handle doubles as the author facet — card and reader share the control. */
export function AuthorHandle({
  handle,
  suffix,
  tokens,
  className,
}: {
  handle: string;
  suffix?: string;
  tokens?: string[];
  className?: string;
}) {
  const { author, toggleAuthor } = useLibraryFilters();
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleAuthor(handle);
      }}
      title={`Only posts from @${handle}`}
      className={cn(
        'w-fit max-w-full truncate text-left transition-colors hover:text-text-primary',
        author === handle ? 'text-text-secondary' : 'text-muted-foreground',
        className,
      )}
    >
      @<PostText text={handle} tokens={tokens} />
      {suffix}
    </button>
  );
}

interface BookmarkCardProps {
  bookmark: Bookmark;
  index: number;
  tokens: string[];
  selected: boolean;
  /** Checkboxes are pinned open while organizing; otherwise they wait for hover. */
  selectVisible: boolean;
  onToggleSelect: (id: number) => void;
  onExtendSelect: (id: number) => void;
}

/**
 * 2a / 3a post card. Deliberately chrome-free: the whole card opens the reader,
 * which is where every action on a post lives. The one exception is the
 * selection checkbox, which takes over the timestamp's corner while organizing
 * so the header keeps its metrics instead of shifting on hover.
 *
 * Memoized because building a selection re-renders the whole grid on every
 * click, and a card is an expensive subtree.
 */
export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  index,
  tokens,
  selected,
  selectVisible,
  onToggleSelect,
  onExtendSelect,
}: BookmarkCardProps) {
  const { folderId, tags, setFolder, toggleTag, openPost } = useLibraryFilters();
  const age = bookmark.bookmarked_at ? compactAge(bookmark.bookmarked_at) : null;
  const primaryFolder = bookmark.folders[0] ?? null;

  function activate(event: MouseEvent) {
    if (event.shiftKey) onExtendSelect(bookmark.id);
    // Once a selection exists, a plain click keeps building it — opening a post
    // mid-sweep would lose the set you were assembling.
    else if (event.metaKey || event.ctrlKey || selectVisible) onToggleSelect(bookmark.id);
    else openPost(bookmark.id);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      data-card-index={index}
      aria-label={`Open post by ${bookmark.author_name}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (event.key === ' ') onToggleSelect(bookmark.id);
        else openPost(bookmark.id);
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-[13px] rounded-[14px] border bg-card p-[18px] md:gap-3.5 md:rounded-[12px] md:p-5',
        'transition-colors duration-150 hover:bg-card-hover',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected
          ? 'border-chip-active-border bg-card-hover'
          : 'border-card-border hover:border-card-border-hover',
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
            <PostText text={bookmark.author_name} tokens={tokens} />
          </span>
          <AuthorHandle
            handle={bookmark.author_handle}
            tokens={tokens}
            className="text-[12px] md:text-[11px]"
          />
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select post by ${bookmark.author_name}`}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey) onExtendSelect(bookmark.id);
            else onToggleSelect(bookmark.id);
          }}
          className={cn(
            'size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
            selected
              ? 'border-chip-active-border bg-chip-active text-chip-active-foreground'
              : 'border-input-border text-transparent hover:border-[#4a4a52]',
            selectVisible ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
          )}
        >
          <CheckIcon className="size-3" />
        </button>
        {age && (
          <span
            className={cn(
              'shrink-0 text-[12px] text-text-faint md:text-[11px]',
              selectVisible ? 'hidden' : 'group-hover:hidden group-focus-within:hidden',
            )}
          >
            {age}
          </span>
        )}
      </div>

      {bookmark.body && (
        <p className="line-clamp-[14] font-serif text-[19px] leading-[1.5] whitespace-pre-wrap text-[#d6d6da] md:text-[18px]">
          <PostText text={bookmark.body} links={bookmark.links} tokens={tokens} stopPropagation />
        </p>
      )}

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
            <PostText
              text={bookmark.quoted_tweet.body}
              links={bookmark.quoted_tweet.links}
              tokens={tokens}
              stopPropagation
            />
          </p>
        </div>
      )}

      <CardMedia items={bookmark.media} />

      <PostMetrics metrics={bookmark.metrics} />

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
});
