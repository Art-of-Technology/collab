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
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-10">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/4 xl:w-1/5">
            <Sidebar pathname={pathname} />
          </div>
          <main className="md:w-3/4 xl:w-4/5">
            {children}
          </main>
        </div>
      </div>
      
      {/* Chat Widget */}
      <ChatboxWrapper />
    </div>
  );
} 