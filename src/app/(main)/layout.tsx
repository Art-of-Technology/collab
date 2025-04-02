"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";

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
        <div className="w-64 fixed top-16 bottom-0 left-0 bg-[#191919] border-r border-[#2a2929] z-40 overflow-y-auto">
          <div className="p-4">
            <Sidebar pathname={pathname} />
          </div>
        </div>
        
        {/* Main content area - with left padding to account for sidebar */}
        <main className="flex-1 ml-64 pt-20 pb-8 px-4 overflow-y-auto bg-[#191919]">
          <div className="mx-auto w-full p-12">
            {children}
          </div>
        </main>
      </div>
      
      {/* Chat Widget */}
      {/* <ChatboxWrapper /> */}
    </div>
  );
} 