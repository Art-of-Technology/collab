import { NextRequest, NextResponse } from 'next/server';
import { resolveIssueKeyToId, resolveIdToIssueKey, resolveIssueIdOrKey } from '@/lib/issue-key-resolvers';
import { isIssueKey } from '@/lib/shared-issue-key-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get('value');
    const action = searchParams.get('action'); // 'toId', 'toIssueKey', or 'resolve'
    const workspaceId = searchParams.get('workspaceId'); // Optional workspace ID for scoping

    if (!value || !action) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!['toId', 'toIssueKey', 'resolve'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    let result = null;

    if (action === 'toId') {
      // Convert issue key to ID
      if (isIssueKey(value)) {
        result = await resolveIssueKeyToId(value, workspaceId || undefined);
      } else {
        // Already an ID, return as-is
        result = value;
      }
    } else if (action === 'toIssueKey') {
      // Convert ID to issue key
      result = await resolveIdToIssueKey(value);
    } else if (action === 'resolve') {
      // Resolve either ID or key to get both
      result = await resolveIssueIdOrKey(value, workspaceId || undefined);
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error resolving issue key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
