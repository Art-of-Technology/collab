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
    <div className="min-h-screen bg-[#101011]">
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
            } fixed top-16 bottom-0 left-0 bg-[#090909] z-30 overflow-y-auto transition-all duration-300 ease-in-out ${isCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
            }`}
        >
          {/* Sidebar content with border */}
          <div className="h-full border-r border-[#1f1f1f] relative">
            <Sidebar
              pathname={pathname}
              isCollapsed={isCollapsed}
              toggleSidebar={toggleSidebar}
            />
          </div>
        </div>

        {/* Toggle Button - positioned outside sidebar but accessible */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={`fixed top-20 z-40 transition-all duration-300 ease-in-out ${isCollapsed ? 'left-20' : 'left-[260px]'
            } bg-[#090909] border border-[#1f1f1f] hover:bg-[#1a1a1a] text-gray-400 hover:text-white`}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" />
          )}
        </Button>

        {/* Main content area */}
        <main
          className={`flex-1 transition-all pt-16 duration-300 ease-in-out ${isCollapsed ? 'ml-16' : 'ml-64'
            } bg-[#101011] overflow-auto`}
        >
          <div className="h-full">
            {children}
          </div>
        </main>

        {/* Mobile sidebar overlay */}
        {!isCollapsed && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={toggleSidebar}
          />
        )}
      </div>
    </div>
  );
}