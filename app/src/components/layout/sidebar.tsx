'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  BookmarkIcon,
  RefreshCw,
  PlusIcon,
  AlertCircle,
  Loader2,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { SyncDialog } from '@/components/sync/sync-dialog';
import { useFolders, useCreateFolder, useDeleteFolder } from '@/hooks/use-folders';
import { useTags } from '@/hooks/use-tags';
import { useAutoTag } from '@/hooks/use-bookmarks';
import { useSyncStatus } from '@/hooks/use-sync';
import { cn } from '@/lib/utils';
import { parseStringList } from '@/lib/url-params';
import type { Folder, Tag } from '@/types';

const FOLDER_COLORS = [
  '#1d9bf0', '#f91880', '#00ba7c', '#ffd400',
  '#ff7a00', '#7856ff', '#fa3939', '#71767b',
];

// Treat ⌘/Ctrl-click as multi-select (desktop). Touch users get long-press
// via `useLongPress`.
function isMultiSelectClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

const LONG_PRESS_MS = 450;

// Long-press handlers for a clickable row on touch devices. `onLongPress`
// fires after a 450ms touch-and-hold and the subsequent synthetic click is
// suppressed so it doesn't double-fire as a regular tap.
//
// Implementation note: the timer + fired flag MUST live in a `useRef` rather
// than be reallocated each render. The sidebar re-renders frequently (tag /
// folder counts update via React Query), and if `start` and `cancel` close
// over different `state` objects across renders, `cancel` becomes a no-op and
// the timer fires after the user has already lifted off — triggering ghost
// long-presses that flip the multi-select state. `onLongPressRef` is also
// kept current so the callback always sees the latest props.
function useLongPress(onLongPress: () => void) {
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  });
  const state = useRef({ timer: null as ReturnType<typeof setTimeout> | null, fired: false });

  return useMemo(
    () => ({
      onTouchStart: () => {
        state.current.fired = false;
        if (state.current.timer) clearTimeout(state.current.timer);
        state.current.timer = setTimeout(() => {
          state.current.fired = true;
          onLongPressRef.current();
        }, LONG_PRESS_MS);
      },
      onTouchEnd: () => {
        if (state.current.timer) {
          clearTimeout(state.current.timer);
          state.current.timer = null;
        }
      },
      onTouchMove: () => {
        if (state.current.timer) {
          clearTimeout(state.current.timer);
          state.current.timer = null;
        }
      },
      onTouchCancel: () => {
        if (state.current.timer) {
          clearTimeout(state.current.timer);
          state.current.timer = null;
        }
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (state.current.fired) {
          e.stopPropagation();
          e.preventDefault();
          state.current.fired = false;
        }
      },
    }),
    [],
  );
}

// Per-row components are extracted so each row can call `useLongPress` once
// (hooks can't go inside `.map` callbacks). They also own their own confirm-
// dialog state so the sidebar isn't tangled in row-level UI.

interface FolderRowProps {
  folder: Folder;
  isActive: boolean;
  onSelect: (id: number, additive: boolean) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

function FolderRow({ folder, isActive, onSelect, onDelete, isDeleting }: FolderRowProps) {
  const longPress = useLongPress(() => onSelect(folder.id, true));
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          'group/folder flex items-center rounded-md transition-colors duration-150',
          isActive ? 'bg-secondary' : 'hover:bg-secondary/50',
        )}
      >
        <button
          onClick={(e) => onSelect(folder.id, isMultiSelectClick(e))}
          title="Click to filter — ⌘/Ctrl-click (or long-press) to toggle in multi-select"
          className={cn(
            'flex-1 flex items-center justify-between px-3 py-2 md:py-1.5 text-sm min-w-0',
            isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
          )}
          {...longPress}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: folder.color ?? '#71767b' }}
            />
            <span className="truncate text-xs">{folder.name}</span>
          </div>
          {folder.bookmark_count !== undefined && (
            <span className="text-[13px] font-mono text-text-secondary shrink-0 [@media(hover:hover)]:group-hover/folder:hidden">
              {folder.bookmark_count}
            </span>
          )}
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isDeleting}
          aria-label={`Delete folder ${folder.name}`}
          className="flex [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover/folder:flex items-center px-2 py-1 text-text-secondary hover:text-[#f4212e] transition-colors disabled:opacity-50"
          title="Delete folder"
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Delete folder &ldquo;{folder.name}&rdquo;?
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              The folder is removed but the bookmarks inside it stay in your archive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="border-border text-text-primary"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(folder.id);
                setConfirmOpen(false);
              }}
              disabled={isDeleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TagButtonProps {
  tag: Tag;
  isActive: boolean;
  onSelect: (name: string, additive: boolean) => void;
}

function TagButton({ tag, isActive, onSelect }: TagButtonProps) {
  const longPress = useLongPress(() => onSelect(tag.name, true));
  return (
    <button
      onClick={(e) => onSelect(tag.name, isMultiSelectClick(e))}
      title="Click to filter — ⌘/Ctrl-click (or long-press) to combine with other tags"
      className={cn(
        'text-[14px] px-2.5 py-1 md:py-0.5 rounded-full border transition-colors duration-150',
        isActive
          ? 'bg-[#1d9bf0]/20 border-[#1d9bf0] text-[#1d9bf0]'
          : 'border-border text-text-secondary hover:border-[#1d9bf0]/50 hover:text-text-primary',
      )}
      {...longPress}
    >
      {tag.name}
      <span className="ml-1 opacity-60">{tag.bookmark_count}</span>
    </button>
  );
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [addingFolder, setAddingFolder] = useState(false);

  const { data: folders = [] } = useFolders();
  const { data: tags = [] } = useTags();
  const { data: syncStatus } = useSyncStatus();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const autoTag = useAutoTag();

  const activeFolderIds = parseStringList(searchParams.get('folder_id'));
  const activeTagNames = parseStringList(searchParams.get('tag'));
  const untaggedActive = searchParams.get('untagged') === '1';

  function pushParams(updater: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('page', '1');
    updater(next);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    onClose?.();
  }

  function selectFolder(id: number, additive: boolean) {
    pushParams((next) => {
      next.delete('untagged');
      next.delete('tag');
      const idStr = String(id);
      if (additive) {
        const set = new Set(activeFolderIds);
        if (set.has(idStr)) set.delete(idStr);
        else set.add(idStr);
        if (set.size === 0) next.delete('folder_id');
        else next.set('folder_id', [...set].join(','));
      } else if (activeFolderIds.length === 1 && activeFolderIds[0] === idStr) {
        next.delete('folder_id');
      } else {
        next.set('folder_id', idStr);
      }
    });
  }

  function selectTag(name: string, additive: boolean) {
    pushParams((next) => {
      next.delete('untagged');
      next.delete('folder_id');
      if (additive) {
        const set = new Set(activeTagNames);
        if (set.has(name)) set.delete(name);
        else set.add(name);
        if (set.size === 0) next.delete('tag');
        else next.set('tag', [...set].join(','));
      } else if (activeTagNames.length === 1 && activeTagNames[0] === name) {
        next.delete('tag');
      } else {
        next.set('tag', name);
      }
    });
  }

  function selectAll() {
    router.push(pathname);
    onClose?.();
  }

  function selectUntagged() {
    pushParams((next) => {
      next.delete('folder_id');
      next.delete('tag');
      if (untaggedActive) next.delete('untagged');
      else next.set('untagged', '1');
    });
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    await createFolder.mutateAsync({ name: newFolderName.trim(), color: newFolderColor });
    setNewFolderName('');
    setAddingFolder(false);
  }

  const isAllActive =
    activeFolderIds.length === 0 && activeTagNames.length === 0 && !untaggedActive;
  const lastSynced = syncStatus?.last_synced_at
    ? formatDistanceToNow(new Date(syncStatus.last_synced_at * 1000), { addSuffix: true })
    : null;

  return (
    <aside
      className={cn(
        'w-[280px] md:w-[220px] shrink-0 flex flex-col h-screen border-r border-border bg-sidebar overflow-y-auto',
        // Mobile: fixed overlay that slides in/out
        'fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: back to normal flow, always visible
        'md:sticky md:top-0 md:translate-x-0 md:z-auto',
      )}
    >
      {/* App header */}
      <div className="px-4 pt-5 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookmarkIcon className="w-4 h-4 text-[#1d9bf0]" />
            <span className="font-semibold text-sm text-text-primary tracking-tight">
              X Bookmarks
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden flex items-center justify-center w-9 h-9 -mr-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-secondary transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {syncStatus?.last_error && (
        <Alert variant="destructive" className="mx-3 mt-3 py-2 px-3 text-xs">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs leading-tight">
            {syncStatus.last_error}
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-3 space-y-0.5">
        {/* All bookmarks */}
        <button
          onClick={selectAll}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors duration-150',
            isAllActive
              ? 'bg-secondary text-text-primary'
              : 'text-text-secondary hover:bg-secondary/50 hover:text-text-primary',
          )}
        >
          <span>All Bookmarks</span>
          {syncStatus && (
            <Badge
              variant="secondary"
              className="text-[13px] px-1.5 py-0 h-5 bg-muted text-text-secondary font-mono"
            >
              {syncStatus.total_bookmarks}
            </Badge>
          )}
        </button>

        {/* Untagged */}
        <button
          onClick={selectUntagged}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors duration-150',
            untaggedActive
              ? 'bg-secondary text-text-primary'
              : 'text-text-secondary hover:bg-secondary/50 hover:text-text-primary',
          )}
        >
          <span>Untagged</span>
          {syncStatus && syncStatus.untagged_count > 0 && (
            <Badge
              variant="secondary"
              className="text-[13px] px-1.5 py-0 h-5 bg-muted text-text-secondary font-mono"
            >
              {syncStatus.untagged_count}
            </Badge>
          )}
        </button>

        {/* Folders section */}
        <div className="pt-3 pb-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[14px] font-semibold uppercase tracking-wider text-text-secondary">
              Folders
            </span>
            <button
              onClick={() => setAddingFolder((v) => !v)}
              aria-label="New folder"
              className="flex items-center justify-center w-7 h-7 -mr-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-secondary transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {addingFolder && (
            <div className="px-2 mb-2 space-y-1.5">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setAddingFolder(false);
                }}
                placeholder="Folder name"
                className="h-9 md:h-7 text-sm md:text-xs bg-secondary border-border"
              />
              <div className="flex gap-2 flex-wrap px-1 py-1">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewFolderColor(c)}
                    aria-label={`Color ${c}`}
                    className="w-6 h-6 md:w-4 md:h-4 rounded-full ring-offset-background transition-all"
                    style={{
                      backgroundColor: c,
                      outline: newFolderColor === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-8 md:h-6 text-xs flex-1 bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white"
                  onClick={handleCreateFolder}
                  disabled={createFolder.isPending}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 md:h-6 text-xs"
                  onClick={() => setAddingFolder(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              isActive={activeFolderIds.includes(String(folder.id))}
              onSelect={selectFolder}
              onDelete={(id) => deleteFolder.mutate(id)}
              isDeleting={deleteFolder.isPending}
            />
          ))}
          {folders.length === 0 && !addingFolder && (
            <p className="px-3 text-[14px] text-muted-foreground italic">No folders yet</p>
          )}
        </div>

        {/* Tags section */}
        <div className="pt-2 pb-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[14px] font-semibold uppercase tracking-wider text-text-secondary">
              Tags
            </span>
            <button
              onClick={() => autoTag.mutate(undefined)}
              disabled={autoTag.isPending}
              title="Auto-classify untagged bookmarks"
              aria-label="Auto-classify untagged bookmarks"
              className="flex items-center justify-center w-7 h-7 -mr-1.5 rounded-md text-text-secondary hover:text-[#1d9bf0] hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {autoTag.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="px-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagButton
                key={tag.id}
                tag={tag}
                isActive={activeTagNames.includes(tag.name)}
                onSelect={selectTag}
              />
            ))}
            {tags.length === 0 && (
              <p className="px-1 text-[14px] text-muted-foreground italic">No tags yet</p>
            )}
          </div>
        </div>
      </nav>

      {/* Sync status footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {syncStatus?.in_progress && (
          <div className="flex items-center gap-2 text-xs text-[#1d9bf0]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Syncing…</span>
          </div>
        )}
        {lastSynced && !syncStatus?.in_progress && (
          <p className="text-[14px] text-muted-foreground font-mono">
            Synced {lastSynced}
          </p>
        )}
        {!lastSynced && !syncStatus?.in_progress && (
          <p className="text-[14px] text-muted-foreground italic">Never synced</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-9 md:h-7 text-xs border-border text-text-secondary hover:text-text-primary gap-1.5"
          onClick={() => setSyncDialogOpen(true)}
        >
          <RefreshCw className="w-3.5 h-3.5 md:w-3 md:h-3" />
          Sync Now
        </Button>
      </div>

      <SyncDialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen} />
    </aside>
  );
}
