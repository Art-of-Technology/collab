import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import SidebarProvider from "@/components/providers/SidebarProvider";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";

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

  const pathname = "/workspaces";
  return (
    <SidebarProvider>
      <LayoutWithSidebar pathname={pathname}>
        <div className="mx-auto w-full h-full">{children}</div>
      </LayoutWithSidebar>
    </SidebarProvider>
  );
}
