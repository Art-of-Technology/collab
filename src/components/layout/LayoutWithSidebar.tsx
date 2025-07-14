"use client";

import React from "react";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import AssistantWrapper from "@/components/layout/AssistantWrapper";
import ChatboxWrapper from "./ChatboxWrapper";
import { AppDock } from "@/components/dock";

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

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left sidebar - responsive */}
        <div
          className={`${isCollapsed ? 'w-16' : 'w-64'
            } fixed top-16 bottom-0 left-0 bg-[#191919] z-30 overflow-y-auto transition-all duration-300 ease-in-out ${isCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
            }`}
        >
          {/* Sidebar content with border */}
          <div className="h-full border-r border-[#2a2929] relative">
            <div className="p-4">
              <Sidebar
                pathname={pathname}
                isCollapsed={isCollapsed}
                toggleSidebar={toggleSidebar}
              />
            </div>
          </div>
        </div>

        {/* Toggle Button - positioned outside sidebar but accessible */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle Sidebar"
          aria-expanded={isCollapsed}
          onClick={toggleSidebar}
          className={`fixed top-1/2 -translate-y-1/2 z-50 hidden md:flex items-center justify-center bg-[#191919] hover:bg-[#2a2929] focus-visible:ring focus-visible:outline-none h-12 w-6 border-t border-r border-b border-[#2a2929] transition-all duration-300 ease-in-out border border-l-0 rounded-r-md rounded-l-none  ${
            isCollapsed 
              ? 'left-16'  // When collapsed
              : 'left-64' // When expanded
          }`}
        >
          {/* Border cover inside the button */}
          <div className="absolute left-[-1px] top-0 w-[1px] h-full bg-[#191919]"></div>
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4 text-gray-300" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4 text-gray-300" />
          )}
        </Button>

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
          className={`flex-1 pt-16 pb-[90px] px-2 md:px-4 overflow-y-auto bg-[#191919] transition-all duration-300 ease-in-out ${isCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-64'
            }`}
        >
          <div className="mx-auto w-full p-4 md:p-12">
            {children}
          </div>
        </main>
        <ChatboxWrapper />
        {/* AI Assistant */}
        <AssistantWrapper />
        {/* App Dock - Only show when enabled */}
        <AppDock />
      </div>
    </div>
  );
}