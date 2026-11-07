import { withAppAuth } from '@/lib/apps/auth-middleware';
import { handoffBody } from '@/lib/agent-handoff-http';
import { reviewResponse } from '@/lib/agent-review-http';
import { createReview, createReviewSchema, listReviews, reviewListSchema } from '@/lib/agent-reviews';

export const GET = withAppAuth(async (request, context) => reviewResponse(async () => {
  const query = new URL(request.url).searchParams;
  return listReviews(context, reviewListSchema.parse({ agent: query.get('agent'),
    ...(query.has('limit') && { limit: query.get('limit') }), ...(query.has('cursor') && { cursor: query.get('cursor') }) }));
}), { requiredScopes: ['issues:read'] });

export const POST = withAppAuth(async (request, context) => reviewResponse(async () =>
  createReview(context, createReviewSchema.parse(await handoffBody(request)))), { requiredScopes: ['issues:read', 'issues:write'] });
