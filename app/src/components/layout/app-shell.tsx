'use client';

import { useState, Suspense } from 'react';
import { MenuIcon } from 'lucide-react';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-secondary transition-colors"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm text-[var(--text-primary)] tracking-tight">
            X Bookmarks
          </span>
        </div>

        {children}
      </main>
    </div>
  );
}
