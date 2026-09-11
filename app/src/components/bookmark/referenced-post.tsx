'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { CardMedia, ReaderMedia } from './post-media';
import { CommunityNotes } from './community-note';
import { PostText } from './post-text';
import { cn } from '@/lib/utils';
import type { ReferencedTweet } from '@/types';

export function ReferencedPost({
  post,
  label,
  compact,
  tokens = [],
}: {
  post: ReferencedTweet;
  label: 'Quoted post' | 'Replying to';
  compact: boolean;
  tokens?: string[];
}) {
  const url = post.author_handle
    ? `https://x.com/${post.author_handle}/status/${post.tweet_id}`
    : `https://x.com/i/web/status/${post.tweet_id}`;
  return (
    <section
      className={cn(
        'rounded-xl border border-card-border bg-[#101012]',
        compact ? 'p-3' : 'flex flex-col gap-3 p-4',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="mr-1 shrink-0 font-mono text-[10px] tracking-wide text-text-faint uppercase">
          {label}
        </span>
        <span className="truncate text-[12px] font-medium text-text-secondary">
          {post.author_name}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(event) => event.stopPropagation()}
          className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] text-text-faint hover:text-text-secondary"
        >
          @{post.author_handle}
          {!compact && <ExternalLinkIcon className="size-3 shrink-0" />}
        </a>
      </div>
      <p
        className={cn(
          'font-serif leading-[1.5] whitespace-pre-wrap text-[#9a9aa0]',
          compact ? 'mt-1 line-clamp-3 text-[15px]' : 'text-[17px]',
        )}
      >
        <PostText
          text={post.body}
          links={post.links}
          tokens={tokens}
          stopPropagation={compact}
        />
      </p>
      {!compact && <ReaderMedia items={post.media} />}
      {compact && post.media.length > 0 && <CardMedia items={post.media.slice(0, 1)} />}
      <CommunityNotes
        notes={post.community_notes}
        compact={compact}
        tokens={tokens}
        stopPropagation={compact}
      />
    </section>
  );
}
