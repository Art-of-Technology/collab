import React from "react";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getAuthSession } from "@/lib/auth";
import { getValidWorkspaceId } from "@/lib/workspace-helpers";

export default async function WelcomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current user session
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Check if user has a valid current workspace (cookie or fallback)
  const workspaceId = await getValidWorkspaceId({ id: session.user.id });
  const hasWorkspaces = !!workspaceId;
  
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