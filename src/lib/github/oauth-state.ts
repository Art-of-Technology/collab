import { randomBytes } from 'node:crypto';
import { EncryptionService } from '@/lib/encryption';

const production = process.env.NODE_ENV === 'production';
export const GITHUB_OAUTH_COOKIE = production ? '__Host-collab-github-oauth' : 'collab-github-oauth';
export const GITHUB_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/', maxAge: 600,
};

type GitHubOAuthState = {
  kind: 'github-oauth-state'; version: 1; nonce: string; userId: string;
  projectId: string | null; expiresAt: number;
};

export function createGitHubOAuthState(userId: string, projectId: string | null) {
  const state = randomBytes(32).toString('hex');
  const payload: GitHubOAuthState = {
    kind: 'github-oauth-state', version: 1, nonce: state, userId, projectId,
    expiresAt: Date.now() + GITHUB_OAUTH_COOKIE_OPTIONS.maxAge * 1000,
  };
  return { state, cookie: EncryptionService.encrypt(payload) };
}

export function readGitHubOAuthState(cookie: string | undefined, nonce: string | null, userId: string): GitHubOAuthState | null {
  if (!cookie || cookie.length > 2048 || !nonce || !/^[a-f0-9]{64}$/.test(nonce)) return null;
  try {
    const value = EncryptionService.decrypt(cookie);
    const now = Date.now();
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.kind !== 'github-oauth-state' || value.version !== 1 ||
      typeof value.nonce !== 'string' || value.nonce !== nonce ||
      typeof value.userId !== 'string' || value.userId !== userId ||
      !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now ||
      value.expiresAt > now + GITHUB_OAUTH_COOKIE_OPTIONS.maxAge * 1000 ||
      !(value.projectId === null || (typeof value.projectId === 'string' && value.projectId.length > 0 && value.projectId.length <= 256))) return null;
    return value;
  } catch {
    return null;
  }
}
