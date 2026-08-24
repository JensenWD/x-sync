'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Multi-select over the current result page.
 *
 * The selection survives paging — building one up across pages and then filing
 * it in a single action is the point — but resets whenever the facets change,
 * because a selection you can no longer see is a selection you cannot check
 * before acting on it.
 *
 * The hook also owns whether the checkboxes are pinned open, so `visible` has
 * one definition rather than each surface re-deriving it, and returns one
 * memoized object so the callbacks built on it downstream stay stable.
 */
export function useSelection(orderedIds: number[], filterSignature: string) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [pinned, setPinned] = useState(false);
  const anchor = useRef<number | null>(null);
  const lastSignature = useRef(filterSignature);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected((current) => (current.size === 0 ? current : new Set()));
  }, []);

  useEffect(() => {
    if (lastSignature.current === filterSignature) return;
    lastSignature.current = filterSignature;
    clear();
  }, [clear, filterSignature]);

  const toggle = useCallback((id: number) => {
    anchor.current = id;
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  /** Shift-click: everything between the last touched card and this one, inclusive. */
  const extendTo = useCallback(
    (id: number) => {
      const from = anchor.current === null ? -1 : orderedIds.indexOf(anchor.current);
      const to = orderedIds.indexOf(id);
      if (to === -1) return;
      if (from === -1) {
        toggle(id);
        return;
      }
      const [start, end] = from <= to ? [from, to] : [to, from];
      setSelected((current) => {
        const next = new Set(current);
        for (const rangeId of orderedIds.slice(start, end + 1)) next.add(rangeId);
        return next;
      });
      anchor.current = id;
    },
    [orderedIds, toggle],
  );

  const pageFullySelected =
    orderedIds.length > 0 && orderedIds.every((id) => selected.has(id));

  const selectPage = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of orderedIds) {
        if (pageFullySelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [orderedIds, pageFullySelected]);

  const exit = useCallback(() => {
    setPinned(false);
    clear();
  }, [clear]);

  const active = selected.size > 0;
  const visible = pinned || active;

  const togglePinned = useCallback(() => {
    if (pinned || active) exit();
    else setPinned(true);
  }, [active, exit, pinned]);

  return useMemo(
    () => ({
      selected,
      /** True once anything is selected: plain clicks then organize instead of opening a post. */
      active,
      /** Checkboxes are shown: pinned by the Select control, or implied by a live selection. */
      visible,
      pageFullySelected,
      toggle,
      extendTo,
      selectPage,
      togglePinned,
      exit,
    }),
    [active, exit, extendTo, pageFullySelected, selectPage, selected, toggle, togglePinned, visible],
  );
}

export type Selection = ReturnType<typeof useSelection>;
