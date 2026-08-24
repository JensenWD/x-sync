'use client';

import { EyeIcon, HeartIcon, MessageCircleIcon, Repeat2Icon } from 'lucide-react';
import { cn, compactCount } from '@/lib/utils';
import type { PostMetrics as PostMetricsData } from '@/types';

/**
 * Engagement as X reported it at the last sync. Metrics ride the bookmark
 * request for free, so they are shown where they help judge a post at a glance
 * and nowhere else. Posts synced before the metrics were requested have none
 * and render nothing rather than a row of zeroes.
 */
export function PostMetrics({
  metrics,
  className,
}: {
  metrics: PostMetricsData;
  className?: string;
}) {
  const entries = [
    { key: 'likes', Icon: HeartIcon, value: metrics.like_count ?? 0, label: 'likes' },
    { key: 'reposts', Icon: Repeat2Icon, value: metrics.retweet_count ?? 0, label: 'reposts' },
    { key: 'replies', Icon: MessageCircleIcon, value: metrics.reply_count ?? 0, label: 'replies' },
    { key: 'views', Icon: EyeIcon, value: metrics.impression_count ?? 0, label: 'views' },
  ].filter((entry) => entry.value > 0);

  if (entries.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-3.5 font-mono text-[11px] text-text-faint', className)}>
      {entries.map(({ key, Icon, value, label }) => (
        <span key={key} className="flex items-center gap-1" title={`${value.toLocaleString()} ${label}`}>
          <Icon className="size-3" aria-hidden />
          {compactCount(value)}
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </div>
  );
}
