'use client';

import { useCallback, useEffect, type RefObject } from 'react';
import { ownsKeystroke } from '@/lib/keyboard';

interface GridKeyboardOptions {
  container: RefObject<HTMLElement | null>;
  count: number;
  /** Off while the reader owns the keyboard, so the two never both step. */
  enabled: boolean;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onExtendSelect: (index: number) => void;
  onClear: () => void;
}

/**
 * Reading a library of a few hundred posts one open-and-close at a time is the
 * slow part, so the grid answers to the keys people already expect from a mail
 * client: j/k to walk it, Enter to read, x to select, Escape to drop the
 * selection, / to search.
 *
 * Focus is the cursor — there is no second highlight to keep in sync, so the
 * keys act on whatever card the browser says is focused, however it got there.
 */
export function useGridKeyboard({
  container,
  count,
  enabled,
  onOpen,
  onToggleSelect,
  onExtendSelect,
  onClear,
}: GridKeyboardOptions) {
  const focusedIndex = useCallback(() => {
    const card = (document.activeElement as HTMLElement | null)?.closest('[data-card-index]');
    const index = Number(card?.getAttribute('data-card-index') ?? -1);
    return Number.isInteger(index) && index >= 0 && index < count ? index : -1;
  }, [count]);

  const move = useCallback(
    (delta: number) => {
      if (count === 0) return;
      const from = focusedIndex();
      const next =
        from === -1
          ? delta > 0
            ? 0
            : count - 1
          : Math.min(count - 1, Math.max(0, from + delta));
      const card = container.current?.querySelector<HTMLElement>(`[data-card-index="${next}"]`);
      card?.focus();
      card?.scrollIntoView({ block: 'nearest' });
    },
    [container, count, focusedIndex],
  );

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/' && !ownsKeystroke(event.target)) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-library-search]')?.focus();
        return;
      }
      // Below this line the keys belong to the grid, not to whatever has focus:
      // Escape in the search box should clear the query, not the selection.
      if (ownsKeystroke(event.target)) return;

      const index = focusedIndex();
      switch (event.key) {
        case 'Escape':
          onClear();
          break;
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'Home':
          event.preventDefault();
          move(-count);
          break;
        case 'End':
          event.preventDefault();
          move(count);
          break;
        case 'x':
          if (index >= 0) {
            event.preventDefault();
            if (event.shiftKey) onExtendSelect(index);
            else onToggleSelect(index);
          }
          break;
        case 'Enter':
          if (index >= 0) {
            event.preventDefault();
            onOpen(index);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, enabled, focusedIndex, move, onClear, onExtendSelect, onOpen, onToggleSelect]);
}
