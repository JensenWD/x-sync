'use client';

import { useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLinkIcon, ArchiveIcon, HeartIcon, BookmarkIcon, BadgeCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FolderDropdown } from '@/components/folder/folder-dropdown';
import { TagInput } from '@/components/tag/tag-input';
import { ArchiveBookmarkDialog } from './archive-bookmark-dialog';
import { SuggestedTagChips } from './suggested-tag-chips';
import { useArchiveBookmark } from '@/hooks/use-bookmarks';
import { useSelection } from './selection-context';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Bookmark } from '@/types';

const HANDLE_COLORS = [
  '#1d9bf0', '#f91880', '#00ba7c', '#ffd400',
  '#ff7a00', '#7856ff', '#fa3939',
];

function getHandleColor(handle: string) {
  let hash = 0;
  for (const c of handle) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return HANDLE_COLORS[Math.abs(hash) % HANDLE_COLORS.length];
}

function Avatar({ src, name, handle }: { src: string | null; name: string; handle: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name?.slice(0, 2).toUpperCase() || '??';
  const color = getHandleColor(handle);

  if (!src || failed) {
    return (
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0 select-none"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
      <Image
        src={src}
        alt={name}
        width={32}
        height={32}
        className="w-full h-full object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const mentionRegex = /(@\w+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      const display = part.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1d9bf0] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {display.length > 30 ? display.slice(0, 30) + '…' : display}
        </a>
      );
    }
    return part.split(mentionRegex).map((sub, j) => {
      if (mentionRegex.test(sub)) {
        return (
          <a
            key={`${i}-${j}`}
            href={`https://x.com/${sub.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1d9bf0] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {sub}
          </a>
        );
      }
      return sub;
    });
  });
}

function formatCount(n: number | null | undefined): string {
  if (n == null || n === 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

interface BookmarkCardProps {
  bookmark: Bookmark;
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveBookmark = useArchiveBookmark();
  const { isSelected, toggle, selectionMode } = useSelection();
  const selected = isSelected(bookmark.id);

  const relativeTime = bookmark.bookmarked_at
    ? formatDistanceToNow(new Date(bookmark.bookmarked_at * 1000), { addSuffix: true })
    : null;

  const mediaUrls = bookmark.media_urls ?? [];

  // Card-level activation: open the tweet on X, OR toggle selection while in
  // selection mode. Skips when the user clicked an interactive child or is
  // selecting text. onAuxClick handles middle-click so browsers' native "open
  // in new tab" works on the entire card surface.
  function isInteractiveTarget(e: React.MouseEvent) {
    const target = e.target as HTMLElement | null;
    return !!target?.closest(
      'a, button, input, [role="checkbox"], [data-slot="checkbox"]',
    );
  }

  function handleCardClick(e: React.MouseEvent) {
    if (e.defaultPrevented) return;
    if (isInteractiveTarget(e)) return;
    if (window.getSelection()?.toString()) return;
    if (selectionMode) {
      toggle(bookmark.id);
      return;
    }
    window.open(bookmark.tweet_url, '_blank', 'noopener,noreferrer');
  }

  function handleCardAuxClick(e: React.MouseEvent) {
    if (e.button !== 1) return;
    if (isInteractiveTarget(e)) return;
    e.preventDefault();
    window.open(bookmark.tweet_url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card
      onClick={handleCardClick}
      onAuxClick={handleCardAuxClick}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'group relative gap-0 px-4 py-3 rounded-xl bg-card shadow-[0_4px_24px_rgba(0,0,0,0.55)] hover:shadow-[0_6px_30px_rgba(0,0,0,0.65)] transition-all duration-200 cursor-pointer',
        selected
          ? 'ring-2 ring-[#1d9bf0] bg-[#1d9bf0]/[0.06]'
          : 'ring-1 ring-white/10 hover:ring-white/20',
      )}
    >
      {/* Selection checkbox — always visible on touch; hover-revealed on pointer
          devices (unless already selected or in selection mode). */}
      <div
        className={cn(
          'absolute top-2 right-2 z-20 transition-opacity',
          selected || selectionMode
            ? 'opacity-100'
            : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100',
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => toggle(bookmark.id)}
          aria-label={selected ? 'Deselect bookmark' : 'Select bookmark'}
          className="bg-card/80 backdrop-blur-sm border-white/30 h-5 w-5"
        />
      </div>
      <div className="flex gap-3">
        {/* Avatar column */}
        <div className="flex flex-col items-center shrink-0">
          <Avatar
            src={bookmark.author_avatar}
            name={bookmark.author_name}
            handle={bookmark.author_handle}
          />
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Author row — single line on sm+, stacked on mobile so the
              @handle and timestamp don't crowd out the display name. */}
          <div className="mb-1 flex flex-col sm:flex-row sm:items-center sm:gap-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[17px] sm:text-[19px] font-bold text-[var(--text-primary)] truncate">
                {bookmark.author_name}
              </span>
              {bookmark.author_verified && (
                <BadgeCheckIcon className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] text-[#1d9bf0] shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 min-w-0 text-[14px] sm:text-[19px] text-[var(--text-secondary)]">
              <span className="truncate">@{bookmark.author_handle}</span>
              {relativeTime && (
                <>
                  <span>·</span>
                  <span className="shrink-0 hover:underline">{relativeTime}</span>
                </>
              )}
            </div>
          </div>

          {/* Tweet text */}
          <div
            className="text-[19px] text-[var(--text-primary)] whitespace-pre-wrap leading-6 mb-2"
          >
            {linkifyText(bookmark.full_text)}
          </div>

          {/* Media grid */}
          {mediaUrls.length > 0 && (
            <div
              className={cn(
                'rounded-2xl overflow-hidden mb-2',
                mediaUrls.length === 1 && 'max-h-[300px]',
                mediaUrls.length >= 2 && 'grid gap-0.5',
                mediaUrls.length === 2 && 'grid-cols-2',
                mediaUrls.length === 3 && 'grid-cols-2',
                mediaUrls.length >= 4 && 'grid-cols-2 grid-rows-2',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {mediaUrls.slice(0, 4).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'relative block bg-[#1a1a1a]',
                    mediaUrls.length === 1 ? 'aspect-video' : 'aspect-square',
                    mediaUrls.length === 3 && i === 0 && 'row-span-2',
                  )}
                >
                  <Image
                    src={url}
                    alt="media"
                    fill
                    className="object-cover"
                    unoptimized
                    sizes="(max-width: 600px) 100vw, 500px"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Quoted tweet */}
          {bookmark.quoted_tweet && (
            <a
              href={`https://x.com/${bookmark.quoted_tweet.author_handle}/status/${bookmark.quoted_tweet.tweet_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-2 border border-[var(--card-border)] rounded-2xl p-3 hover:bg-[#1a1a1a] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[16px] font-bold text-[var(--text-primary)]">
                  {bookmark.quoted_tweet.author_name}
                </span>
                <span className="text-[16px] text-[var(--text-secondary)]">
                  @{bookmark.quoted_tweet.author_handle}
                </span>
              </div>
              <p className="text-[16px] text-[var(--text-primary)] leading-[22px]">
                {bookmark.quoted_tweet.full_text}
              </p>
            </a>
          )}

          {/* Folder + tag chips */}
          {(bookmark.folders.length > 0 || bookmark.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2" onClick={(e) => e.stopPropagation()}>
              {bookmark.folders.map((f) => (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="text-[14px] px-2 py-0.5 h-6 font-normal rounded-full"
                  style={{ borderLeft: `3px solid ${f.color ?? '#71767b'}` }}
                >
                  {f.name}
                </Badge>
              ))}
              {bookmark.tags.map((t) => (
                <span
                  key={t.id}
                  className={cn(
                    'text-[14px] font-bold font-mono text-white',
                    t.source === 'auto' && 'opacity-60',
                  )}
                >
                  #{t.name}
                </span>
              ))}
            </div>
          )}

          {/* Suggested tags — heuristic, click to add */}
          {bookmark.suggested_tags && bookmark.suggested_tags.length > 0 && (
            <SuggestedTagChips
              bookmarkId={bookmark.id}
              suggestions={bookmark.suggested_tags}
            />
          )}

          {/* Engagement metrics row */}
          <div
            className="flex items-center gap-5 -ml-2 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Likes */}
            <span className="flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)]">
              <HeartIcon className="w-[18px] h-[18px]" />
              {bookmark.like_count > 0 && (
                <span className="text-[16px] leading-none">{formatCount(bookmark.like_count)}</span>
              )}
            </span>

            {/* Bookmarks */}
            <span className="flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)]">
              <BookmarkIcon className="w-[18px] h-[18px]" />
              {bookmark.bookmark_count != null && bookmark.bookmark_count > 0 && (
                <span className="text-[16px] leading-none">{formatCount(bookmark.bookmark_count)}</span>
              )}
            </span>

            {/* View on X */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={bookmark.tweet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center p-2 rounded-full text-[var(--text-secondary)] hover:text-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition-colors"
                  />
                }
              >
                <ExternalLinkIcon className="w-[18px] h-[18px]" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                View on X
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Manage row — folder, tags, archive. Always visible on touch;
              hover-revealed on pointer devices. */}
          <div
            className="flex items-center gap-1 -ml-2 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <FolderDropdown bookmarkId={bookmark.id} bookmarkFolders={bookmark.folders} />
            <TagInput bookmarkId={bookmark.id} bookmarkTags={bookmark.tags} />
            <button
              title="Archive bookmark"
              aria-label="Archive bookmark"
              className="flex items-center p-3 sm:p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              onClick={() => setArchiveOpen(true)}
            >
              <ArchiveIcon className="w-5 h-5 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>
      </div>

      <ArchiveBookmarkDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={() => {
          archiveBookmark.mutate(bookmark.id);
          setArchiveOpen(false);
        }}
        isPending={archiveBookmark.isPending}
      />
    </Card>
  );
}
