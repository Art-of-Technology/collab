import { createHash } from 'node:crypto';

export type GatewayIdentity = { issuer: string; subject: string; email: string; accountKey: string };

export function authMode(): 'nextauth' | 'gateway' | 'invalid' {
  const mode = process.env.COLLAB_AUTH_MODE ?? 'nextauth';
  return mode === 'nextauth' || mode === 'gateway' ? mode : 'invalid';
}

function decode(value: string | null, maximum: number): string {
  if (!value || value.length > maximum * 2 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid gateway identity');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > maximum || bytes.toString('base64url') !== value) throw new Error('Invalid gateway encoding');
  const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!result || /[\u0000-\u0020\u007f]/.test(result)) throw new Error('Invalid gateway identity');
  return result;
}

export function readGatewayIdentity(headers: Pick<Headers, 'get'>, expectedIssuer: string): GatewayIdentity | null {
  try {
    if (!expectedIssuer || headers.get('x-collab-email-verified') !== 'true') return null;
    const issuer = decode(headers.get('x-collab-issuer'), 1024);
    const subject = decode(headers.get('x-collab-subject'), 512);
    const email = decode(headers.get('x-collab-email'), 320);
    if (issuer !== expectedIssuer || !/^[^\s@]+@weezboo\.com$/i.test(email)) return null;
    return { issuer, subject, email,
      accountKey: createHash('sha256').update(issuer).update('\0').update(subject).digest('hex') };
  } catch { return null; }
}

export function gatewayMutationAllowed(method: string, headers: Pick<Headers, 'get'>, publicOrigin: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  try {
    const configured = new URL(publicOrigin);
    if (configured.protocol !== 'https:' || configured.origin !== publicOrigin || configured.username || configured.password) return false;
    return headers.get('origin') === publicOrigin;
  } catch { return false; }
}
