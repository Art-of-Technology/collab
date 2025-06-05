import React from "react";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SidebarProvider from "@/components/providers/SidebarProvider";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";
import { AppDock } from "@/components/dock";

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current user session
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get current path from pathname
  const pathname = /* @ts-expect-error Server Component */
    URL.pathname || "";
  
  // Check if user has any workspaces
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
  
  // Special paths that should not show sidebar
  const isWelcomePage = pathname === '/welcome';
  const isInvitationPage = pathname.startsWith('/workspace-invitation/');
  
  // Determine whether to show sidebar
  const shouldShowSidebar = hasWorkspaces && !isWelcomePage && !isInvitationPage;
  
  // Pre-rendered layout with sidebar
  if (shouldShowSidebar) {
    return (
      <SidebarProvider>
        <LayoutWithSidebar 
          pathname={pathname || '/'} 
          session={session}
          hasWorkspaces={hasWorkspaces}
        >
          {children}
        </LayoutWithSidebar>
      </SidebarProvider>
    );
  }
  
  // Pre-rendered layout without sidebar
  return (
    <div className="min-h-screen bg-[#191919]">
      {/* Top navbar - full width */}
      <Navbar 
        hasWorkspaces={hasWorkspaces}
        shouldShowSearch={false}
        userEmail={session.user.email || ''}
        userName={session.user.name || ''}
        userImage={session.user.image || ''}
      />
      
      {/* Main content area - full width */}
      <main className="pt-20 pb-[90px] px-4 overflow-y-auto bg-[#191919]">
        <div className="mx-auto w-full p-12">
          {children}
        </div>
      </main>
      
      {/* App Dock */}
      <AppDock />
    </div>
  );
} 