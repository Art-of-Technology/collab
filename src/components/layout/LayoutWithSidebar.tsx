"use client";

import React from "react";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import AssistantWrapper from "@/components/layout/AssistantWrapper";
import ChatboxWrapper from "./ChatboxWrapper";

interface LayoutWithSidebarProps {
  children: React.ReactNode;
  pathname: string;
  session: any;
  hasWorkspaces: boolean;
}

export default function LayoutWithSidebar({
  children,
  pathname,
  session,
  hasWorkspaces,
}: LayoutWithSidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen bg-[#191919]">
      {/* Top navbar - full width */}
      <Navbar
        hasWorkspaces={hasWorkspaces}
        shouldShowSearch={true}
        userEmail={session.user.email || ''}
        userName={session.user.name || ''}
        userImage={session.user.image || ''}
      />

      {/* Toggle Button - fixed position */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className={`fixed z-50 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center ${isCollapsed
            ? 'left-[16px] md:left-[16px]' // When collapsed
            : 'left-[254px]'               // When expanded
          } bg-[#1c1c1c] hover:bg-[#2a2929] rounded-full p-1 shadow-md border border-[#333] h-8 w-8`}
      >
        {isCollapsed ? (
          <ChevronRightIcon className="h-5 w-5 text-gray-300" />
        ) : (
          <ChevronLeftIcon className="h-5 w-5 text-gray-300" />
        )}
      </Button>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left sidebar - responsive */}
        <div
          className={`${isCollapsed ? 'w-16' : 'w-64'
            } fixed top-16 bottom-0 left-0 bg-[#191919] border-r border-[#2a2929] z-30 overflow-y-auto transition-all duration-300 ease-in-out ${isCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
            }`}
        >
          <div className="p-4">
            <Sidebar
              pathname={pathname}
              isCollapsed={isCollapsed}
              toggleSidebar={toggleSidebar}
            />
          </div>
        </div>

        {/* Dark overlay when sidebar is open on mobile */}
        {!isCollapsed && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-70 z-20"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}

        {/* Main content area - responsive padding */}
        <main
          className={`flex-1 pt-16 pb-8 px-2 md:px-4 overflow-y-auto bg-[#191919] transition-all duration-300 ease-in-out ${isCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-64'
            }`}
        >
          <div className="mx-auto w-full p-4 md:p-12">
            {children}
          </div>
        </main>
        <ChatboxWrapper />
        {/* AI Assistant */}
        <AssistantWrapper />
      </div>
    </div>
  );
} 