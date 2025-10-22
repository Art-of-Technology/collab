import React from "react";
import Navbar from "@/components/layout/Navbar";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceInvitationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current user session
  const session = await getAuthSession();
  
  // Authentication is handled by individual pages to preserve URL parameters
  
  // Check if user has any workspaces (only if authenticated)
  let hasWorkspaces = false;
  if (session?.user) {
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
    
    hasWorkspaces = userWorkspaces.length > 0;
  }
  
  return (
    <>
      {/* Top navbar - full width */}
      <Navbar 
        hasWorkspaces={hasWorkspaces}
        shouldShowSearch={false}
        userEmail={session?.user?.email || ''}
        userName={session?.user?.name || ''}
        userImage={session?.user?.image || ''}
      />
      
      {/* Main content area - full width */}
      <main className="pt-20 pb-[90px] px-4 overflow-y-auto bg-[#191919] h-screen">
        <div className="mx-auto w-full p-2 md:p-12">
          {children}
        </div>
      </main>
    </>
  );
} 