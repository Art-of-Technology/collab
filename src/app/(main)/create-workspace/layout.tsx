import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";
import SidebarProvider from "@/components/providers/SidebarProvider";

export default async function CreateWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get the current user session
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  const pathname = "/create-workspace";
  return (
    <SidebarProvider>
      <LayoutWithSidebar pathname={pathname}>
        <div className="mx-auto w-full h-full">{children}</div>
      </LayoutWithSidebar>
    </SidebarProvider>
  );
} 