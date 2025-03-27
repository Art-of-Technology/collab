"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import ChatboxWrapper from "@/components/layout/ChatboxWrapper";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current path to highlight active menu items
  const pathname = usePathname();
  
  return (
    <div className="min-h-screen bg-[#191919]">
      {/* Top navbar - full width */}
      <Navbar />
      
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left sidebar - fixed width */}
        <div className="w-64 fixed top-16 bottom-0 left-0 bg-card/95 border-r border-border z-40 overflow-y-auto">
          <div className="p-4">
            <Sidebar pathname={pathname} />
          </div>
        </div>
        
        {/* Main content area - with left padding to account for sidebar */}
        <main className="flex-1 ml-64 pt-20 pb-8 px-4 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      
      {/* Chat Widget */}
      <ChatboxWrapper />
    </div>
  );
} 