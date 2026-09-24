'use client';
import { signOut } from 'next-auth/react';

export async function signOutCurrentSession(): Promise<boolean> {
  const configuration = await fetch('/api/auth/mode', { cache: 'no-store' });
  if (!configuration.ok) throw new Error('Unable to resolve authentication mode');
  const { authMode } = await configuration.json();
  if (authMode === 'gateway') {
    // Stock mod_auth_openidc local-session logout; its native landing prevents automatic SSO re-entry.
    window.location.assign(new URL('/oauth2/callback?logout=get', window.location.origin).href);
    return false;
  }
  if (authMode !== 'nextauth') throw new Error('Unknown authentication mode');
  const result = await signOut({ redirect: false });
  if (!result || typeof result.url !== 'string' || !result.url) throw new Error('Sign out failed');
  const response = await fetch('/api/auth/session', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to confirm sign out');
  const remainingSession = await response.json();
  if (remainingSession !== null && (typeof remainingSession !== 'object' || Object.keys(remainingSession).length !== 0)) {
    throw new Error('Sign out failed');
  }
  return true;
}
