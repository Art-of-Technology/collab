'use client';
import type { Session } from 'next-auth';
import { signOut } from 'next-auth/react';

export async function signOutCurrentSession(session: Session | null | undefined): Promise<boolean> {
  if (session?.authMode === 'gateway') {
    // Stock mod_auth_openidc local-session logout; its native landing prevents automatic SSO re-entry.
    window.location.assign(new URL('/oauth2/callback?logout=get', window.location.origin).href);
    return false;
  }
  await signOut({ redirect: false });
  return true;
}
