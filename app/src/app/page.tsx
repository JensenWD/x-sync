import { Suspense } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { BookmarkGrid } from '@/components/bookmark/bookmark-grid';

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense>
        <Sidebar />
      </Suspense>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Suspense>
          <BookmarkGrid />
        </Suspense>
      </main>
    </div>
  );
}
