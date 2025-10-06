import React from "react";

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <div className="min-h-screen bg-[#191919]">
      {children}
    </div>
  );
} 