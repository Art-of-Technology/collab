'use client';

import React, { useMemo } from 'react';
import DevSidebar from '@/components/dev/DevSidebar';
import DevBreadcrumb from '@/components/dev/DevBreadcrumb';
import SidebarProvider from '@/components/providers/SidebarProvider';
import { useSidebar } from '@/components/providers/SidebarProvider';
import { Button } from '@/components/ui/button';
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

function DevLayoutContent({ children }: { children: React.ReactNode }) {
  const {
    isCollapsedDesktop,
    isMobileOpen,
    toggleDesktop,
    toggleMobile,
    isMdUp,
    isCollapsed,
  } = useSidebar();

  const sidebarLeft = useMemo(() => {
    if (isMdUp) return "calc(var(--sidebar-width))";
    if (isMobileOpen) return "calc(var(--sidebar-open))";
    return "0px";
  }, [isMdUp, isMobileOpen]);

  return (
    <div className="h-screen bg-[#101011]">
      <div className="app-layout">
        {/* Desktop Sidebar */}
        <div
          className="app-sidebar hidden md:block"
          data-collapsed={isCollapsedDesktop}
        >
          <div className="app-sidebar__content overflow-y-auto">
            <DevSidebar isCollapsed={isCollapsedDesktop} />
          </div>
        </div>

        {/* Main Content */}
        <main className="bg-[#090909] flex h-full md:overflow-hidden">
          <div className="flex-1 p-2 min-w-0 md:overflow-hidden">
            <div className="h-full bg-[#101011] border border-[#1f1f1f] rounded-md overflow-hidden flex flex-col relative">
              {/* Mobile Header */}
              <div className="md:hidden border-b border-[#1f1f1f] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                    <span className="text-primary-foreground text-sm font-bold">D</span>
                  </div>
                  <span className="font-semibold text-sm">Developer Console</span>
                  <span className="text-xs bg-muted px-2 py-1 rounded">BETA</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMobile}
                  className="h-8 w-8"
                >
                  {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
              </div>
              {/* Breadcrumb - positioned at top left */}
              <div className="absolute top-2 sm:top-3 left-2 sm:left-4 z-10 md:block hidden bg-transparent p-0 m-0 border-0">
                <DevBreadcrumb />
              </div>
              {/* Breadcrumb for mobile - below header */}
              <div className="md:hidden">
                <DevBreadcrumb />
              </div>
              {/* Content - with top padding to avoid breadcrumb overlap on desktop */}
              <div className="flex-1 overflow-auto pt-0 md:pt-8">
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Mobile Overlay Sidebar */}
        <div
          className="app-sidebar md:hidden"
          data-open={isMobileOpen}
          aria-modal="true"
          role="dialog"
        >
          <div className="h-full relative overflow-y-auto">
            <DevSidebar isCollapsed={false} />
          </div>
        </div>

        {/* Mobile Backdrop */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={toggleMobile}
          />
        )}

        {/* Desktop Sidebar Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={isMdUp ? toggleDesktop : toggleMobile}
          className="sidebar-toggle fixed top-1/2 -translate-y-1/2 z-40 w-6 hidden md:flex
                       bg-[#090909] border border-[#1f1f1f] hover:bg-[#1a1a1a]
                       text-gray-400 hover:text-white rounded-r-md rounded-l-none border-l-0 shadow-md transition-all duration-200"
          style={{ left: `calc(${sidebarLeft} + 8px)` }}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <DevLayoutContent>{children}</DevLayoutContent>
    </SidebarProvider>
  );
}
