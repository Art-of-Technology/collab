import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody, handoffResponse } from '@/lib/agent-handoff-http';
import { coordinatorLease, coordinatorSchema, coordinatorSnapshot } from '@/lib/project-coordinator';

export const GET = withAppAuth(async (request, context) => handoffResponse(() =>
  coordinatorSnapshot(context, request.nextUrl.searchParams.get('project') || '', request.nextUrl.searchParams.get('cursor') || undefined)),
{ requiredScopes: ['issues:read', 'projects:read'] });
export const POST = withAppAuth(async (request, context) => handoffResponse(async () =>
  coordinatorLease(context, coordinatorSchema.parse(await handoffBody(request)))),
{ requiredScopes: ['workspace:write', 'issues:read', 'issues:write', 'projects:read'] });
