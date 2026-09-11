'use client';

import { MessageSquareWarningIcon } from 'lucide-react';
import { PostText } from './post-text';
import { cn } from '@/lib/utils';
import type { CommunityNote } from '@/types';

export function CommunityNotes({
  notes,
  compact = false,
  tokens = [],
  stopPropagation = false,
}: {
  notes: CommunityNote[];
  compact?: boolean;
  tokens?: string[];
  stopPropagation?: boolean;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {notes.map((note) => (
        <aside
          key={note.note_id}
          className="rounded-xl border border-[#5d5129] bg-[#211e13] px-3.5 py-3 text-[#ddd2a8]"
        >
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-wide text-[#d7bd63] uppercase">
            <MessageSquareWarningIcon className="size-3.5" />
            Community Note
            {note.is_media_note && (
              <span className="normal-case text-[#9d926c]">· matching media</span>
            )}
          </div>
          <p
            className={cn(
              'font-serif leading-[1.5] whitespace-pre-wrap',
              compact ? 'line-clamp-4 text-[14px]' : 'text-[16px]',
            )}
          >
            <PostText
              text={note.summary}
              tokens={tokens}
              stopPropagation={stopPropagation}
              linkClassName="text-[#e4ca70] decoration-[#e4ca70]/30"
            />
          </p>
        </aside>
      ))}
    </div>
  );
}
