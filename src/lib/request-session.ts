import 'server-only';
import { getServerSession as nextAuthSession } from 'next-auth';
import type { Session } from 'next-auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { authMode, readGatewayIdentity } from './gateway-identity';

export async function getGatewaySession(requestHeaders?: Pick<Headers, 'get'>): Promise<Session | null> {
  const identity = readGatewayIdentity(requestHeaders ?? await headers(), process.env.COLLAB_GATEWAY_ISSUER ?? '');
  if (!identity) return null;
  // Provision this mapping explicitly. Email alone never creates or links a user.
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: 'maestro', providerAccountId: identity.accountKey } },
    select: { user: { select: { id: true, email: true, name: true, image: true, role: true,
      team: true, currentFocus: true, expertise: true,
      accounts: { where: { provider: 'maestro' }, select: { id: true }, take: 2 } } } },
  });
  const user = account?.user;
  if (!user || user.accounts.length !== 1 || user.email?.toLowerCase() !== identity.email.toLowerCase()) return null;
  return { authMode: 'gateway', user: { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role,
    team: user.team, currentFocus: user.currentFocus, expertise: user.expertise },
    expires: new Date(Date.now() + 60000).toISOString() };
}

export const getServerSession: typeof nextAuthSession = (async (...args: Parameters<typeof nextAuthSession>) => {
  const mode = authMode();
  if (mode === 'invalid') return null;
  if (mode === 'gateway') return getGatewaySession();
  return nextAuthSession(...args);
}) as typeof nextAuthSession;
