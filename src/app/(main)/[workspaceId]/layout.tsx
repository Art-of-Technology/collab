import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
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

  // Resolve the current database user by session subject.
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Verify the workspace exists (by slug or legacy id) and the user has access to it
  const workspace = await prisma.workspace.findFirst({
    where: postWorkspaceAccessWhere(user.id, workspaceId),
  });

  if (!workspace) {
    redirect("/welcome");
  }

  return (
    <SidebarProvider>
      <LayoutWithSidebar
        pathname={`/${workspaceId}`}
      >
        {children}
      </LayoutWithSidebar>
    </SidebarProvider>
  );
}
