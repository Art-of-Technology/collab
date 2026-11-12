import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { issueAccessWhere } from '@/lib/issue-finder';
import { isIssueKey } from '@/lib/shared-issue-key-utils';

// With action=resolve a value in UUID form is looked up as an ID, anything else as an issue key.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // One lookup, limited to workspaces the caller can use; the same key can exist in another one.
    const byId = action === 'toIssueKey' || (action === 'resolve' && UUID.test(value));
    const issue = action === 'toId' && !isIssueKey(value) ? null : await prisma.issue.findFirst({
      where: {
        ...(byId ? { id: value } : { issueKey: value, ...(workspaceId ? { workspaceId } : {}) }),
        ...issueAccessWhere(user.id),
      },
      select: { id: true, issueKey: true },
    });

    let result: string | { id: string; issueKey: string | null } | null = issue;
    if (action === 'toId') {
      // Something that is not an issue key is taken to be an ID already and returned as given
      result = isIssueKey(value) ? issue?.id ?? null : value;
    } else if (action === 'toIssueKey') {
      result = issue?.issueKey ?? null;
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error resolving issue key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
