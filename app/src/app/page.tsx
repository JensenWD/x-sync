import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { BookmarkGrid } from '@/components/bookmark/bookmark-grid';

export default function Home() {
  return (
    <AppShell>
      <Suspense>
        <BookmarkGrid />
      </Suspense>
    </AppShell>
  );
}
