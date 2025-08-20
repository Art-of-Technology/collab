"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type SidebarContextType = {
  isCollapsedDesktop: boolean;
  toggleDesktop: () => void;
  setCollapsedDesktop: (v: boolean) => void;
  isMobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
  isMdUp: boolean;
  isCollapsed: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  isCollapsedDesktop: false,
  toggleDesktop: () => { },
  setCollapsedDesktop: () => { },
  isMobileOpen: false,
  openMobile: () => { },
  closeMobile: () => { },
  toggleMobile: () => { },
  isMdUp: false,
  isCollapsed: false,
  toggleSidebar: () => { },
});

export function useSidebar() {
  return useContext(SidebarContext);
}

/** Small helpers */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function persistDesktop(state: "open" | "closed") {
  try {
    // Persist quickly on client (SSR will also read this on next request)
    document.cookie = `sidebarDesktop=${state};path=/;max-age=31536000;samesite=lax`;
    // Optionally hit your API (non-blocking)
    fetch("/api/sidebar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "desktop", state }),
    }).catch(() => { });
  } catch { }
}

export default function SidebarProvider({ children }: { children: React.ReactNode }) {
  /** Media query: we only use this to decide which controls to expose; we DO NOT mutate desktop state on resize. */
  const [isMdUp, setIsMdUp] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMdUp(e.matches);

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /** Desktop collapsed: read from cookie or infer from CSS var set by the server (no CLS either way). */
  const [isCollapsedDesktop, setCollapsedDesktop] = useState<boolean>(() => {
    // Default expanded (open) on desktop; server should have set --sidebar-width already.
    // Reading cookie here avoids a flip during hydration.
    const cookie = getCookie("sidebarDesktop");
    if (cookie === "open") return false;
    if (cookie === "closed") return true;
    return false; // default
  });

  const toggleDesktop = () => {
    setCollapsedDesktop((prev) => {
      const next = !prev;
      // Update the CSS var immediately so the floating toggle, etc., stay aligned
      const width = next ? "var(--sidebar-closed)" : "var(--sidebar-open)";
      document.body.style.setProperty("--sidebar-width", width);
      persistDesktop(next ? "closed" : "open");
      return next;
    });
  };

  /** Mobile overlay drawer state — independent from desktop collapse. */
  const [isMobileOpen, setMobileOpen] = useState(false);
  const openMobile = () => setMobileOpen(true);
  const closeMobile = () => setMobileOpen(false);
  const toggleMobile = () => setMobileOpen((v) => !v);

  /** When switching up to desktop, ensure the mobile drawer is closed (no hidden overlay traps). */
  useEffect(() => {
    if (isMdUp) setMobileOpen(false);
  }, [isMdUp]);

  /** Back-compat values for existing consumers (so you don’t have to refactor everything at once). */
  const isCollapsed = useMemo(() => {
    return isMdUp ? isCollapsedDesktop : !isMobileOpen;
  }, [isMdUp, isCollapsedDesktop, isMobileOpen]);

  const toggleSidebar = () => {
    if (isMdUp) toggleDesktop();
    else toggleMobile();
  };

  /** Keep the CSS var in sync if someone setsCollapsedDesktop directly */
  useEffect(() => {
    const width = isCollapsedDesktop ? "var(--sidebar-closed)" : "var(--sidebar-open)";
    document.body.style.setProperty("--sidebar-width", width);
  }, [isCollapsedDesktop]);

  const value: SidebarContextType = {
    isCollapsedDesktop,
    toggleDesktop,
    setCollapsedDesktop,
    isMobileOpen,
    openMobile,
    closeMobile,
    toggleMobile,
    isMdUp,
    isCollapsed,
    toggleSidebar,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}