import React from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";

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

  // Streamlined layout - no navbar, full screen experience
  return (
    <>
      {children}
    </>
  );
} 