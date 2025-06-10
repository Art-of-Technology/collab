import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SidebarProvider from "@/components/providers/SidebarProvider";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";

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
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    },
  });
  
  if (!workspace) {
    redirect("/welcome");
  }
  
  // Check if user has any workspaces (for layout logic)
  const userWorkspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    },
    select: { id: true },
    take: 1
  });
  
  const hasWorkspaces = userWorkspaces.length > 0;
  
  // Workspace routes should always show sidebar
  return (
    <SidebarProvider>
      <LayoutWithSidebar 
        pathname={`/${workspaceId}`} 
        session={session}
        hasWorkspaces={hasWorkspaces}
      >
        {children}
      </LayoutWithSidebar>
    </SidebarProvider>
  );
} 