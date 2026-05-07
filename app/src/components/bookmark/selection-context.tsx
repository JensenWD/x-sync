'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface SelectionContextValue {
  selectedIds: ReadonlySet<number>;
  selectionMode: boolean;
  isSelected: (id: number) => boolean;
  toggle: (id: number, shiftKey?: boolean) => void;
  selectMany: (ids: number[]) => void;
  clear: () => void;
  size: number;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [lastToggledId, setLastToggledId] = useState<number | null>(null);

  const toggle = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastToggledId(id);
    },
    [],
  );

  const selectMany = useCallback((ids: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setLastToggledId(null);
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedIds,
      selectionMode: selectedIds.size > 0,
      isSelected: (id: number) => selectedIds.has(id),
      toggle,
      selectMany,
      clear,
      size: selectedIds.size,
    }),
    // lastToggledId is intentionally captured so selection consumers stay reactive
    // when the same id is re-toggled in succession.
    [selectedIds, toggle, selectMany, clear, lastToggledId],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used inside SelectionProvider');
  return ctx;
}
