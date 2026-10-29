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
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={0}
      {...overrides}
    >
      {children}
    </NextAuthSessionProvider>
  );
}