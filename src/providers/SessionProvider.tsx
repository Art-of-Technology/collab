"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider
      refetchOnWindowFocus
      refetchWhenOffline={false}
      refetchInterval={5 * 60}
    >
      {children}
    </NextAuthSessionProvider>
  );
} 