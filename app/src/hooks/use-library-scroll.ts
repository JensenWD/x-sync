'use client';

import { useCallback, useLayoutEffect, useRef, type UIEvent } from 'react';

const positions = new Map<string, number>();

/**
 * Next keeps the grid mounted behind the reader, but query-string navigation
 * can still reset a nested scroll container. Remember each filtered view's
 * position and restore it after the reader closes.
 */
export function useLibraryScroll(
  viewKey: string,
  readerOpen: boolean,
  contentVersion: string,
) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rememberScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!readerOpen) positions.set(viewKey, event.currentTarget.scrollTop);
    },
    [readerOpen, viewKey],
  );

  useLayoutEffect(() => {
    if (readerOpen) return;
    const node = scrollRef.current;
    const saved = positions.get(viewKey);
    if (!node || saved === undefined) return;

    const restore = () => {
      node.scrollTop = saved;
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [contentVersion, readerOpen, viewKey]);

  return { scrollRef, rememberScroll };
}
