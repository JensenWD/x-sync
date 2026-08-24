'use client';

import { useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  Loader2,
  ShareIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FolderDropdown } from '@/components/folder/folder-dropdown';
import { TagInput } from '@/components/tag/tag-input';
import { DeleteBookmarkDialog } from './delete-bookmark-dialog';
import { AuthorHandle, PostAvatar } from './bookmark-card';
import { ReaderMedia } from './post-media';
import { PostMetrics } from './post-metrics';
import { PostText } from './post-text';
import { useBookmark, useDeleteBookmark } from '@/hooks/use-bookmarks';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { ownsKeystroke } from '@/lib/keyboard';
import { searchTokens } from '@/lib/search-tokens';
import { cn, compactAge } from '@/lib/utils';
import type { PostLink } from '@/types';

const ACTION =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] text-[#c8c8ce] transition-colors hover:bg-[#212127]';

const STEP =
  'flex size-8 items-center justify-center rounded-lg text-text-secondary transition-colors enabled:hover:bg-[#212127] enabled:hover:text-text-primary disabled:opacity-30';

/** Only links X could resolve a title for earn a card; the rest stay inline. */
function LinkCards({ links }: { links: PostLink[] }) {
  const unfurled = links.filter((link) => link.kind === 'link' && link.title);
  if (unfurled.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {unfurled.map((link) => (
        <a
          key={link.url}
          href={link.expanded_url ?? link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex flex-col gap-1 rounded-xl border border-card-border bg-card p-3.5 transition-colors hover:border-card-border-hover"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-faint">
            <ExternalLinkIcon className="size-3" />
            {link.display_url ?? link.expanded_url ?? link.url}
          </span>
          <span className="text-[14px] leading-snug font-medium text-text-primary">
            {link.title}
          </span>
          {link.description && (
            <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {link.description}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

/**
 * 3c — the post reader. Full-screen on a phone, a centred panel on desktop.
 * Every per-post action lives here, which is what lets the cards stay clean.
 *
 * `orderedIds` is the grid's current page in its current order, so the reader
 * can step through a filtered set without closing and reopening for each post.
 */
export function BookmarkReader({ orderedIds = [] }: { orderedIds?: number[] }) {
  const { postId, search, closePost, replacePost } = useLibraryFilters();
  const { data: bookmark, isLoading, isError } = useBookmark(postId);
  const deleteBookmark = useDeleteBookmark();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const position = postId === null ? -1 : orderedIds.indexOf(postId);
  const previousId = position > 0 ? orderedIds[position - 1] : null;
  const nextId =
    position !== -1 && position < orderedIds.length - 1 ? orderedIds[position + 1] : null;

  /**
   * Bound to the dialog rather than to `window`: the dialog swallows the arrow
   * keys on their way out, and this way each surface listens on the node it
   * owns — the grid keeps its own handler and the two can never both step.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (ownsKeystroke(event.target)) return;
      if ((event.key === 'ArrowRight' || event.key === 'j') && nextId !== null) {
        event.preventDefault();
        replacePost(nextId);
      }
      if ((event.key === 'ArrowLeft' || event.key === 'k') && previousId !== null) {
        event.preventDefault();
        replacePost(previousId);
      }
    },
    [nextId, previousId, replacePost],
  );

  const tokens = searchTokens(search);
  const age = bookmark?.bookmarked_at ? compactAge(bookmark.bookmarked_at) : null;
  const paragraphs = (bookmark?.body ?? '').split(/\n{2,}/).filter((part) => part.trim());

  async function share() {
    if (!bookmark) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: bookmark.author_name, url: bookmark.tweet_url });
        return;
      } catch {
        // Cancelled or unsupported — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(bookmark.tweet_url);
      toast.success('Post link copied');
    } catch {
      toast.error('Could not copy the post link');
    }
  }

  return (
    <Dialog open={postId !== null} onOpenChange={(open) => !open && closePost()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className={cn(
          'inset-0 top-0 left-0 flex max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0',
          'sm:max-w-none md:inset-y-8 md:left-1/2 md:h-auto md:w-[720px] md:-translate-x-1/2 md:rounded-2xl md:border md:border-border',
        )}
      >
        {/* base-ui wants one stable accessible name for the dialog. */}
        <DialogTitle className="sr-only">
          {bookmark ? `Post by ${bookmark.author_name}` : 'Saved post'}
        </DialogTitle>

        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3.5 md:px-6 md:pt-4">
          <button
            type="button"
            onClick={closePost}
            className="-ml-1.5 flex h-9 items-center gap-1 pr-2 pl-1 text-[15px] text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeftIcon className="size-4" />
            Saved
          </button>

          <div className="flex items-center gap-1">
            {position !== -1 && orderedIds.length > 1 && (
              <>
                <span className="mr-1 font-mono text-[11px] text-text-faint tabular-nums">
                  {position + 1}/{orderedIds.length}
                </span>
                <button
                  type="button"
                  disabled={previousId === null}
                  onClick={() => previousId !== null && replacePost(previousId)}
                  aria-label="Previous post (←)"
                  title="Previous post (←)"
                  className={STEP}
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={nextId === null}
                  onClick={() => nextId !== null && replacePost(nextId)}
                  aria-label="Next post (→)"
                  title="Next post (→)"
                  className={STEP}
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </>
            )}
            {bookmark && (
              <a
                href={bookmark.tweet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 flex h-9 items-center gap-1 font-mono text-[12px] text-text-secondary transition-colors hover:text-text-primary"
              >
                open on X
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-32 md:px-6">
          {isLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-text-secondary">
              <Loader2 className="size-4 animate-spin" /> Loading post…
            </div>
          )}
          {isError && (
            <p className="py-10 font-serif text-[18px] text-text-secondary">
              That post is no longer in your library.
            </p>
          )}
          {bookmark && (
            <div className="flex flex-col gap-[18px]">
              <div className="flex items-center gap-3">
                <PostAvatar
                  src={bookmark.author_avatar}
                  name={bookmark.author_name}
                  className="size-11 text-[14px]"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[16px] font-medium text-text-primary">
                    {bookmark.author_name}
                  </span>
                  <AuthorHandle
                    handle={bookmark.author_handle}
                    suffix={age ? ` · ${age}` : undefined}
                    className="font-mono text-[12px]"
                  />
                </div>
              </div>

              {paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="font-serif text-[21px] leading-[1.55] whitespace-pre-wrap text-[#dededf]"
                >
                  <PostText text={paragraph} links={bookmark.links} tokens={tokens} />
                </p>
              ))}

              {bookmark.quoted_tweet && (
                <div className="rounded-xl border border-card-border bg-card p-4">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-text-primary">
                      {bookmark.quoted_tweet.author_name}
                    </span>
                    <span className="font-mono text-[12px] text-muted-foreground">
                      @{bookmark.quoted_tweet.author_handle}
                    </span>
                  </div>
                  <p className="font-serif text-[17px] leading-[1.5] whitespace-pre-wrap text-[#9a9aa0]">
                    <PostText
                      text={bookmark.quoted_tweet.body}
                      links={bookmark.quoted_tweet.links}
                      tokens={tokens}
                    />
                  </p>
                </div>
              )}

              <ReaderMedia items={bookmark.media} />

              <LinkCards links={bookmark.links} />

              <PostMetrics metrics={bookmark.metrics} className="text-[12px]" />

              {(bookmark.folders.length > 0 || bookmark.tags.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {bookmark.folders.map((folder) => (
                    <span
                      key={folder.id}
                      className="flex h-[34px] items-center gap-2 rounded-full bg-chip px-3 text-[13px] text-[#c8c8ce]"
                    >
                      <span
                        className="size-[5px] rounded-full"
                        style={{ backgroundColor: folder.color ?? '#5c5c62' }}
                      />
                      {folder.name}
                    </span>
                  ))}
                  {bookmark.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="flex h-[34px] items-center rounded-full border border-input-border px-3 font-mono text-[12px] text-text-secondary"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating action bar */}
        {bookmark && (
          <div className="pointer-events-none absolute inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] md:inset-x-6 md:bottom-5">
            <div className="pointer-events-auto flex items-center gap-2 rounded-[18px] border border-[#2a2a2e] bg-[#17171acc] p-2 backdrop-blur-lg">
              <FolderDropdown
                bookmarkId={bookmark.id}
                bookmarkFolders={bookmark.folders}
                triggerClassName={ACTION}
                triggerContent="Collection"
              />
              <TagInput
                bookmarkId={bookmark.id}
                bookmarkTags={bookmark.tags}
                triggerClassName={ACTION}
                triggerContent="Tag"
              />
              <button type="button" onClick={share} className={ACTION}>
                <ShareIcon className="size-3.5" />
                Share
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex h-11 w-16 items-center justify-center rounded-xl text-[14px] text-destructive transition-colors hover:bg-[#241c1e]"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {bookmark && (
          <DeleteBookmarkDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={() => {
              deleteBookmark.mutate(bookmark.id);
              setDeleteOpen(false);
              closePost();
            }}
            isPending={deleteBookmark.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
