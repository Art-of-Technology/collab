import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
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
  
  return (
    <div className="min-h-screen bg-[#191919]">
      {/* App Dock - Only show for admin users and when enabled */}
      {session.user.role === 'admin' && <AppDock />}
      {children}
    </div>
  );
} 