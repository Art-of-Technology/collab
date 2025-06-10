import React from "react";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WorkspacesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current user session
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
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
  
  return (
    <>
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
    </>
  );
} 