"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface SessionProviderProps {
  children: ReactNode;
}

export function NextAuthSessionProvider({ children }: SessionProviderProps) {
  return (
    <SessionProvider
      refetchOnWindowFocus
      refetchWhenOffline={false}
      refetchInterval={5 * 60}
    >
      {children}
    </SessionProvider>
  );
}