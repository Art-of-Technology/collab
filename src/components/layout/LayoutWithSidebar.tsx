"use client";

import React from "react";
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
}

export default function LayoutWithSidebar({
  children,
  pathname,
  session,
}: LayoutWithSidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <div className="h-screen bg-[#101011] flex">
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - responsive */}
        <div
          className={`${isCollapsed ? 'w-16' : 'w-64'
            } bg-[#090909] flex-shrink-0 overflow-y-auto transition-all duration-300 ease-in-out hidden md:flex`}
        >
          {/* Sidebar content with border */}
          <div className="h-full relative">
            <Sidebar
              pathname={pathname}
              isCollapsed={isCollapsed}
              toggleSidebar={toggleSidebar}
            />
          </div>
        </div>

        {/* Mobile sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#090909] transform transition-transform duration-300 ease-in-out md:hidden ${isCollapsed ? '-translate-x-full' : 'translate-x-0'
            }`}
        >
          <div className="h-full relative overflow-y-auto">
            <Sidebar
              pathname={pathname}
              isCollapsed={false}
              toggleSidebar={toggleSidebar}
            />
          </div>
        </div>

        {/* Toggle Button - attached to sidebar edge and vertically centered */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={`fixed top-1/2 -translate-y-1/2 z-40 transition-all duration-300 ease-in-out w-[24px] ${isCollapsed ? 'left-[72px]' : 'left-[264px]'
            } bg-[#090909] border border-[#1f1f1f] hover:bg-[#1a1a1a] text-gray-400 hover:text-white rounded-r-md rounded-l-none border-l-0 shadow-md`}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" />
          )}
        </Button>

        {/* Main content area */}
        <main className="flex-1 bg-[#090909] overflow-hidden p-2">
          <div className="h-full bg-[#101011] border border-[#1f1f1f] rounded-md overflow-auto">
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

      {/* AI Assistant */}
      <AssistantWrapper />

      {/* Chat */}
      <ChatboxWrapper />

      {/* Dock */}
      <AppDock />
    </div>
  );
}