'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PlayIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostMediaItem } from '@/types';

const FALLBACK_RATIO = 16 / 10;

/**
 * The two places media appears, and how each treats a frame too tall for it.
 *
 * A card fills its column and trims the extremes of a very tall screenshot so
 * one post cannot take over the grid; the cap sits high enough that ordinary
 * portrait media — book covers, phone screenshots — still renders whole. The
 * reader fits instead of filling, so it never trims, and it is the only place
 * video actually plays.
 */
const FRAME = {
  card: {
    cap: 'max-h-[640px]',
    sizes: '(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 92vw',
    playable: false,
  },
  reader: {
    cap: 'max-h-[78svh] rounded-xl md:rounded-xl',
    sizes: '(min-width: 768px) 672px, 100vw',
    playable: true,
  },
} as const;

type Variant = keyof typeof FRAME;

function durationLabel(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Holds one piece of media at the ratio it was actually shot at. Posts synced
 * before `media.fields` carried dimensions have none stored, so the frame opens
 * at a neutral ratio and corrects itself from the decoded image — no re-sync
 * needed. When the dimensions are known the measuring handler is not attached
 * at all, so a resized preview cannot shift a card that already knew its size.
 */
function MediaFrame({
  item,
  variant,
  children,
}: {
  item: PostMediaItem;
  variant: Variant;
  children?: React.ReactNode;
}) {
  const known = item.width && item.height ? item.width / item.height : null;
  const [measured, setMeasured] = useState<number | null>(null);
  const ratio = known ?? measured;

  const { cap, sizes, playable } = FRAME[variant];
  const isVideo = item.type !== 'photo';
  const canPlay = playable && isVideo && Boolean(item.playback_url);

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-[10px] bg-[#16161a] md:rounded-[8px]', cap)}
      style={{ aspectRatio: ratio ?? FALLBACK_RATIO }}
    >
      {canPlay ? (
        <video
          src={item.playback_url ?? undefined}
          poster={item.preview_url}
          controls={item.type === 'video'}
          autoPlay={item.type === 'animated_gif'}
          loop={item.type === 'animated_gif'}
          muted={item.type === 'animated_gif'}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={
            known
              ? undefined
              : (event) => {
                  const { videoWidth, videoHeight } = event.currentTarget;
                  if (videoWidth > 0 && videoHeight > 0) setMeasured(videoWidth / videoHeight);
                }
          }
        />
      ) : (
        <Image
          src={item.preview_url}
          alt={item.alt_text ?? 'Post media'}
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
          onLoad={
            known
              ? undefined
              : (event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) setMeasured(naturalWidth / naturalHeight);
                }
          }
        />
      )}

      {isVideo && !canPlay && (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <PlayIcon className="size-4 translate-x-px fill-white text-white" />
            </span>
          </span>
          {item.duration_ms && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
              {durationLabel(item.duration_ms)}
            </span>
          )}
        </>
      )}
      {children}
    </div>
  );
}

/** The card teases the first item at its own ratio; the reader shows them all. */
export function CardMedia({ items }: { items: PostMediaItem[] }) {
  if (items.length === 0) return null;
  return (
    <MediaFrame item={items[0]} variant="card">
      {items.length > 1 && (
        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
          +{items.length - 1}
        </span>
      )}
    </MediaFrame>
  );
}

export function ReaderMedia({ items }: { items: PostMediaItem[] }) {
  return (
    <>
      {items.map((item) => (
        <MediaFrame key={item.url} item={item} variant="reader" />
      ))}
    </>
  );
}
