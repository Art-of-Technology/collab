import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SidebarProvider from "@/components/providers/SidebarProvider";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";
import BoardGenerationStatus from "@/components/tasks/BoardGenerationStatus";
import { BoardGenerationProvider } from "@/context/BoardGenerationContext";
import TaskGenerationStatus from "@/components/tasks/TaskGenerationStatus";
import { TaskGenerationProvider } from "@/context/TaskGenerationContext";
import StoryGenerationStatus from "@/components/stories/StoryGenerationStatus";
import { StoryGenerationProvider } from "@/context/StoryGenerationContext";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
  }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const { workspaceId } = await params;
  
  // Get the current user session
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
    // Verify the workspace exists and user has access to it
  // First try to find by slug, then by ID for backward compatibility
  let workspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceId,
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    },
  });

  // If not found by slug, try by ID (for backward compatibility)
  if (!workspace) {
    workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
    });
  }

  if (!workspace) {
    redirect("/welcome");
  }
  

  
  // Workspace routes should always show sidebar
  console.log('Layout rendering with workspaceId:', workspaceId);
  
  return (
    <SidebarProvider>
      <BoardGenerationProvider workspaceId={workspaceId}>
        <TaskGenerationProvider workspaceId={workspaceId}>
          <StoryGenerationProvider workspaceId={workspaceId}>
            <LayoutWithSidebar 
              pathname={`/${workspaceId}`} 
              session={session}
            >
              {children}
              <BoardGenerationStatus />
              <TaskGenerationStatus />
              <StoryGenerationStatus />
            </LayoutWithSidebar>
          </StoryGenerationProvider>
        </TaskGenerationProvider>
      </BoardGenerationProvider>
    </SidebarProvider>
  );
} 