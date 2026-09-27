import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { appOwnerWhere } from '@/lib/apps/ownership';
import { decryptToken } from '@/lib/apps/crypto';
import { prisma } from '@/lib/prisma';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getCurrentUser();
    if (!actor) return json({ error: 'Unauthorized' }, 401);

    return await prisma.$transaction(async tx => {
      const app = await tx.app.findFirst({
        where: { id, ...appOwnerWhere(actor.id) }, include: { oauthClient: true },
      });
      if (!app) return json({ error: 'App not found' }, 404);
      const client = app.oauthClient;
      if (!client) return json({ error: 'App has no OAuth client' }, 404);
      if (client.clientType !== 'confidential') return json({ error: 'Only confidential clients have secrets' }, 400);
      if (client.tokenEndpointAuthMethod !== 'client_secret_basic') {
        return json({ error: 'Client secret is only available for client_secret_basic authentication method' }, 400);
      }
      if (!client.clientSecret) return json({ error: 'No client secret available' }, 404);
      if (client.secretRevealed) return json({ error: 'Client secret has already been revealed' }, 409);

      const claimed = await tx.appOAuthClient.updateMany({
        where: { id: client.id, app: appOwnerWhere(actor.id), secretRevealed: false, clientSecret: client.clientSecret },
        data: { secretRevealed: true },
      });
      if (claimed.count !== 1) return json({ error: 'Credential changed or access revoked' }, 409);
      // A decryption failure escapes the transaction and rolls back the claim.
      const clientSecret = await decryptToken(Buffer.from(client.clientSecret));
      return json({ success: true, clientSecret, warning: 'This client secret will not be shown again. Store it securely.' });
    });
  } catch (error) {
    console.error('Error revealing client secret:', error);
    return json({ error: 'Failed to reveal client secret' }, 500);
  }
}
