"use client";

import {
  SessionProvider as NextAuthSessionProvider,
  type SessionProviderProps as NextAuthSessionProviderProps,
} from "next-auth/react";

type Props = Omit<NextAuthSessionProviderProps, "children"> & {
  children: React.ReactNode;
};

export default function SessionProvider({ children, ...overrides }: Props) {
  return (
    <NextAuthSessionProvider
      refetchOnWindowFocus
      refetchWhenOffline={false}
      refetchInterval={5 * 60}
      {...overrides}
    >
      {children}
    </NextAuthSessionProvider>
  );
}