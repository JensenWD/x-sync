'use client';

import { useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLinkIcon, Trash2Icon, MessageCircleIcon, Repeat2Icon, HeartIcon, BarChart2Icon, BookmarkIcon, BadgeCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FolderDropdown } from '@/components/folder/folder-dropdown';
import { TagInput } from '@/components/tag/tag-input';
import { DeleteBookmarkDialog } from './delete-bookmark-dialog';
import { useDeleteBookmark } from '@/hooks/use-bookmarks';
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
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 select-none"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
      <Image
        src={src}
        alt={name}
        width={40}
        height={40}
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
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteBookmark = useDeleteBookmark();

  const relativeTime = bookmark.bookmarked_at
    ? formatDistanceToNow(new Date(bookmark.bookmarked_at * 1000), { addSuffix: true })
    : null;

  const mediaUrls = bookmark.media_urls ?? [];

  return (
    <article
      className="group relative border-b border-[var(--card-border)] px-4 py-3 cursor-pointer transition-colors hover:bg-[#080808]"
      onClick={() => setExpanded((v) => !v)}
    >
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
          {/* Author row */}
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[15px] font-bold text-[var(--text-primary)] truncate">
              {bookmark.author_name}
            </span>
            {bookmark.author_verified && (
              <BadgeCheckIcon className="w-[18px] h-[18px] text-[#1d9bf0] shrink-0" />
            )}
            <span className="text-[15px] text-[var(--text-secondary)] truncate">
              @{bookmark.author_handle}
            </span>
            {relativeTime && (
              <>
                <span className="text-[var(--text-secondary)]">·</span>
                <span className="text-[15px] text-[var(--text-secondary)] shrink-0 hover:underline">
                  {relativeTime}
                </span>
              </>
            )}
          </div>

          {/* Tweet text */}
          <div
            className={cn(
              'text-[15px] text-[var(--text-primary)] whitespace-pre-wrap leading-5 mb-2',
              !expanded && 'line-clamp-5',
            )}
          >
            {linkifyText(bookmark.full_text)}
          </div>

          {/* Media grid */}
          {mediaUrls.length > 0 && (
            <div
              className={cn(
                'rounded-2xl overflow-hidden border border-[var(--card-border)] mb-2',
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
                <span className="text-[13px] font-bold text-[var(--text-primary)]">
                  {bookmark.quoted_tweet.author_name}
                </span>
                <span className="text-[13px] text-[var(--text-secondary)]">
                  @{bookmark.quoted_tweet.author_handle}
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-primary)] line-clamp-3 leading-[18px]">
                {bookmark.quoted_tweet.full_text}
              </p>
            </a>
          )}

          {/* Folder + tag chips */}
          {(bookmark.folders.length > 0 || bookmark.tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2" onClick={(e) => e.stopPropagation()}>
              {bookmark.folders.map((f) => (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="text-[11px] px-2 py-0 h-5 font-normal rounded-full"
                  style={{ borderLeft: `3px solid ${f.color ?? '#71767b'}` }}
                >
                  {f.name}
                </Badge>
              ))}
              {bookmark.tags.map((t) => (
                <Badge
                  key={t.id}
                  variant="outline"
                  className="text-[11px] px-2 py-0 h-5 font-mono border-[var(--card-border)] text-[var(--text-secondary)] rounded-full"
                >
                  #{t.name}
                </Badge>
              ))}
            </div>
          )}

          {/* Engagement metrics row — matches X layout */}
          <div
            className="flex items-center justify-between max-w-[425px] -ml-2 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Replies */}
            <button className="group/btn flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)] hover:text-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition-colors">
              <MessageCircleIcon className="w-[18px] h-[18px]" />
              {bookmark.reply_count > 0 && (
                <span className="text-[13px] leading-none">{formatCount(bookmark.reply_count)}</span>
              )}
            </button>

            {/* Retweets */}
            <button className="group/btn flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)] hover:text-[#00ba7c] hover:bg-[#00ba7c]/10 transition-colors">
              <Repeat2Icon className="w-[18px] h-[18px]" />
              {bookmark.retweet_count > 0 && (
                <span className="text-[13px] leading-none">{formatCount(bookmark.retweet_count)}</span>
              )}
            </button>

            {/* Likes */}
            <button className="group/btn flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)] hover:text-[#f91880] hover:bg-[#f91880]/10 transition-colors">
              <HeartIcon className="w-[18px] h-[18px]" />
              {bookmark.like_count > 0 && (
                <span className="text-[13px] leading-none">{formatCount(bookmark.like_count)}</span>
              )}
            </button>

            {/* Views */}
            <button className="group/btn flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)] hover:text-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition-colors">
              <BarChart2Icon className="w-[18px] h-[18px]" />
              {bookmark.view_count != null && bookmark.view_count > 0 && (
                <span className="text-[13px] leading-none">{formatCount(bookmark.view_count)}</span>
              )}
            </button>

            {/* Bookmarks */}
            <button className="group/btn flex items-center gap-1 p-2 rounded-full text-[var(--text-secondary)] hover:text-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition-colors">
              <BookmarkIcon className="w-[18px] h-[18px]" />
              {bookmark.bookmark_count != null && bookmark.bookmark_count > 0 && (
                <span className="text-[13px] leading-none">{formatCount(bookmark.bookmark_count)}</span>
              )}
            </button>

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

          {/* Manage row — folder, tags, delete */}
          <div
            className="flex items-center gap-1 -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <FolderDropdown bookmarkId={bookmark.id} bookmarkFolders={bookmark.folders} />
            <TagInput bookmarkId={bookmark.id} bookmarkTags={bookmark.tags} />
            <button
              title="Remove bookmark"
              className="flex items-center p-2 rounded-full text-[var(--text-secondary)] hover:text-[#f4212e] hover:bg-[#f4212e]/10 transition-colors"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>

      <DeleteBookmarkDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          deleteBookmark.mutate(bookmark.id);
          setDeleteOpen(false);
        }}
        isPending={deleteBookmark.isPending}
      />
    </article>
  );
}
