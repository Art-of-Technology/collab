import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody } from '@/lib/agent-handoff-http';
import { reviewResponse } from '@/lib/agent-review-http';
import { actOnReview, getReview, reviewActionSchema } from '@/lib/agent-reviews';

type Params = { params: Promise<{ id: string }> };
export const GET = withAppAuth(async (request, context, { params }: Params) => reviewResponse(async () =>
  ({ review: await getReview(context, new URL(request.url).searchParams.get('agent') || '', (await params).id) })), { requiredScopes: ['issues:read'] });

export const PATCH = withAppAuth(async (request, context, { params }: Params) => reviewResponse(async () =>
  ({ review: await actOnReview(context, (await params).id, reviewActionSchema.parse(await handoffBody(request))) })),
{ requiredScopes: ['issues:read', 'issues:write'] });
