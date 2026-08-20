'use client';

import { Suspense, useState } from 'react';
import { MenuIcon, XIcon } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { BookmarkGrid } from '@/components/bookmark/bookmark-grid';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from '@/components/ui/dialog';

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Suspense>
          <Sidebar />
        </Suspense>
      </div>

      {/* Mobile Sidebar Dialog */}
      <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <DialogPortal>
          <DialogOverlay className="z-50 bg-black/40 backdrop-blur-sm" />
          <DialogContent
            className="fixed top-0 left-0 bottom-0 z-50 w-[240px] h-full translate-x-0 translate-y-0 rounded-none border-r border-border bg-sidebar p-0 duration-200 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-left-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-left-full sm:max-w-[240px]"
            showCloseButton={false}
          >
            <div className="h-full flex flex-col relative">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-4 right-2 z-10 p-2 text-text-secondary hover:text-text-primary"
              >
                <XIcon className="w-5 h-5" />
              </button>
              <Suspense>
                <Sidebar onSelect={() => setIsMobileMenuOpen(false)} />
              </Suspense>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center h-14 px-4 border-b border-border bg-background sticky top-0 z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
            className="-ml-2 text-text-secondary"
          >
            <MenuIcon className="w-5 h-5" />
          </Button>
          <span className="ml-2 font-semibold text-sm tracking-tight text-text-primary">X Bookmarks</span>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Suspense>
            <BookmarkGrid />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
