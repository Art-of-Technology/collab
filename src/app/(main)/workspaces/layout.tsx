import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
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
    <>
      <LayoutWithSidebar session={session} pathname={pathname}>
        <div className="mx-auto w-full h-full">{children}</div>
      </LayoutWithSidebar>
    </>
  );
}
