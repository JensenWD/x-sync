'use client';

import { useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react';
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
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 select-none"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
      <Image
        src={src}
        alt={name}
        width={36}
        height={36}
        className="w-full h-full object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface BookmarkCardProps {
  bookmark: Bookmark;
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteBookmark = useDeleteBookmark();

  const relativeTime = bookmark.bookmarked_at
    ? formatDistanceToNow(new Date(bookmark.bookmarked_at * 1000), { addSuffix: true })
    : null;

  const mediaToShow = bookmark.media_urls?.slice(0, 2) ?? [];
  const extraMedia = (bookmark.media_urls?.length ?? 0) - 2;

  return (
    <article
      className={cn(
        'group relative bg-card border rounded-lg p-4 cursor-pointer transition-all duration-150',
        'border-[var(--card-border)] hover:border-[var(--card-border-hover)] hover:shadow-lg',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar
          src={bookmark.author_avatar}
          name={bookmark.author_name}
          handle={bookmark.author_handle}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">
              {bookmark.author_name}
            </span>
            <span className="text-xs font-mono text-text-secondary truncate">
              @{bookmark.author_handle}
            </span>
          </div>
          {relativeTime && (
            <span className="text-[11px] font-mono text-muted-foreground">{relativeTime}</span>
          )}
        </div>
      </div>

      {/* Tweet text */}
      <p
        className={cn(
          'text-sm text-text-primary whitespace-pre-wrap mb-3 leading-relaxed',
          !expanded && 'line-clamp-3',
        )}
      >
        {bookmark.full_text}
      </p>

      {/* Quoted tweet */}
      {bookmark.quoted_tweet && (
        <div className="mb-3 border border-[var(--card-border)] rounded-md p-3 bg-[#111111]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-text-primary">
              {bookmark.quoted_tweet.author_name}
            </span>
            <span className="text-[11px] font-mono text-text-secondary">
              @{bookmark.quoted_tweet.author_handle}
            </span>
          </div>
          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
            {bookmark.quoted_tweet.full_text}
          </p>
        </div>
      )}

      {/* Media */}
      {mediaToShow.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {mediaToShow.map((url, i) => (
            <div key={i} className="relative w-24 h-16 rounded-md overflow-hidden bg-muted">
              <Image
                src={url}
                alt="media"
                fill
                className="object-cover"
                unoptimized
                sizes="96px"
              />
            </div>
          ))}
          {extraMedia > 0 && (
            <div className="w-24 h-16 rounded-md bg-secondary flex items-center justify-center">
              <span className="text-xs text-text-secondary font-mono">+{extraMedia}</span>
            </div>
          )}
        </div>
      )}

      {/* Folder + tag chips */}
      {(bookmark.folders.length > 0 || bookmark.tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-2" onClick={(e) => e.stopPropagation()}>
          {bookmark.folders.map((f) => (
            <Badge
              key={f.id}
              variant="secondary"
              className="text-[10px] px-2 py-0 h-4 font-normal"
              style={{ borderLeft: `3px solid ${f.color ?? '#71767b'}` }}
            >
              {f.name}
            </Badge>
          ))}
          {bookmark.tags.map((t) => (
            <Badge
              key={t.id}
              variant="outline"
              className="text-[10px] px-2 py-0 h-4 font-mono border-border text-text-secondary"
            >
              #{t.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Hover action row */}
      <div
        className={cn(
          'flex items-center gap-1 mt-2 transition-opacity duration-150',
          hovered ? 'opacity-100' : 'opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Open on X — uses render prop to make TooltipTrigger render as <a> */}
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={bookmark.tweet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-[#71767b] hover:text-[#1d9bf0] hover:bg-secondary transition-colors"
              />
            }
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Open on X
          </TooltipContent>
        </Tooltip>

        {/* Folder popover — self-contained, renders its own trigger */}
        <FolderDropdown bookmarkId={bookmark.id} bookmarkFolders={bookmark.folders} />

        {/* Tag popover — self-contained, renders its own trigger */}
        <TagInput bookmarkId={bookmark.id} bookmarkTags={bookmark.tags} />

        {/* Remove */}
        <button
          title="Remove bookmark"
          className="p-1.5 rounded-md text-[#71767b] hover:text-destructive hover:bg-secondary transition-colors"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
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
