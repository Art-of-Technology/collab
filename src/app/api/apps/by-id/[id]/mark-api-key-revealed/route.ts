import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { appOwnerWhere } from '@/lib/apps/ownership';
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
    const app = await prisma.app.findFirst({
      where: { id, ...appOwnerWhere(actor.id) }, include: { oauthClient: true },
    });
    if (!app) return json({ error: 'App not found' }, 404);
    const client = app.oauthClient;
    if (!client) return json({ error: 'App has no OAuth client' }, 404);
    if (!client.apiKey) return json({ error: 'No API key available' }, 404);
    if (client.apiKeyRevealed) return json({ error: 'API key has already been revealed' }, 409);
    const claimed = await prisma.appOAuthClient.updateMany({
      where: { id: client.id, app: appOwnerWhere(actor.id), apiKeyRevealed: false, apiKey: client.apiKey },
      data: { apiKeyRevealed: true },
    });
    if (claimed.count !== 1) return json({ error: 'Credential changed or access revoked' }, 409);
    return json({ success: true, apiKey: client.apiKey });
  } catch (error) {
    console.error('Error revealing API key:', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
