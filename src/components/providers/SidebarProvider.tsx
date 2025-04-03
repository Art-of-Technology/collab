"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export default function SidebarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default to collapsed on mobile, expanded on desktop
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Check window size on initial load and resize
  useEffect(() => {
    const checkScreenSize = () => {
      // Default collapsed on small screens, expanded on larger screens
      setIsCollapsed(window.innerWidth < 768);
    };

    // Set initial state
    checkScreenSize();

    // Add event listener for window resize
    window.addEventListener("resize", checkScreenSize);

    // Cleanup
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
} 