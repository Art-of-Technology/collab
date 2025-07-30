import { NextRequest, NextResponse } from 'next/server';
import { resolveIssueKeyToId, resolveIdToIssueKey } from '@/lib/issue-key-resolvers';
import { isIssueKey } from '@/lib/shared-issue-key-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get('value');
    const entityType = searchParams.get('entityType') as 'task' | 'epic' | 'story' | 'milestone';
    const action = searchParams.get('action'); // 'toId' or 'toIssueKey'

    if (!value || !entityType || !action) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!['task', 'epic', 'story', 'milestone'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    if (!['toId', 'toIssueKey'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    let result = null;

    if (action === 'toId') {
      // Convert issue key to ID
      if (isIssueKey(value)) {
        result = await resolveIssueKeyToId(value, entityType);
      } else {
        // Already an ID, return as-is
        result = value;
      }
    } else if (action === 'toIssueKey') {
      // Convert ID to issue key
      result = await resolveIdToIssueKey(value, entityType);
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error resolving issue key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 