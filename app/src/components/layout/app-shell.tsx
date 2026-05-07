'use client';

import { useState, useEffect, Suspense } from 'react';
import { MenuIcon } from 'lucide-react';
import { Sidebar } from './sidebar';
import { MobileSyncButton } from './mobile-sync-button';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll while the mobile drawer is open so off-target touches
  // don't scroll the feed underneath the backdrop.
  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Suspense>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </Suspense>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="flex items-center justify-center w-11 h-11 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-secondary transition-colors"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <span className="flex-1 font-semibold text-sm text-[var(--text-primary)] tracking-tight">
            X Bookmarks
          </span>
          <Suspense>
            <MobileSyncButton />
          </Suspense>
        </div>

        {children}
      </main>
    </div>
  );
}
