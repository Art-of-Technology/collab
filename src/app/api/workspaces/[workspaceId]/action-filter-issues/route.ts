import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ActionFilter } from '@/components/views/selectors/ActionFiltersSelector';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    const { actionFilters }: { actionFilters: ActionFilter[] } = await request.json();

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: {
          some: {
            user: {
              email: session.user.email
            }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (!actionFilters.length) {
      return NextResponse.json({ issueIds: [] });
    }

    // Build conditions for each action filter (handling async operations properly)
    const activityQueries = [];

    for (const filter of actionFilters) {
      const baseQuery = {
        itemType: 'ISSUE',
        action: filter.actionType,
        workspaceId,
      };

      // Add sub-conditions if they exist
      if (filter.subConditions && filter.subConditions.values.length > 0) {
        const { type, values } = filter.subConditions;

        switch (filter.actionType) {
          case 'STATUS_CHANGED':
            if (type === 'to') {
              // For status changes, we need to convert status IDs to status names
              // First, fetch the actual status names/values from the status IDs
              const statusRecords = await prisma.projectStatus.findMany({
                where: {
                  id: { in: values },
                  project: { workspaceId }
                },
                select: { name: true, displayName: true }
              });

              // Use both name and displayName to match what might be stored in activities
              const statusValues = statusRecords.flatMap(s => [s.name, s.displayName].filter(Boolean));


              if (statusValues.length > 0) {
                activityQueries.push({
                  ...baseQuery,
                  newValue: { in: statusValues.map(v => JSON.stringify(v)) }
                });
              } else {
                // Fallback: if we can't find status records, try the original IDs
                activityQueries.push({
                  ...baseQuery,
                  newValue: { in: values.map(v => JSON.stringify(v)) }
                });
              }
            }
            break;

          case 'PRIORITY_CHANGED':
            if (type === 'to') {
              // For priority changes, we need to check the newValue field
              activityQueries.push({
                ...baseQuery,
                newValue: { in: values.map(v => JSON.stringify(v)) }
              });
            }
            break;

          case 'ASSIGNED':
            if (type === 'to') {
              // For assignments, we need to check the newValue field
              activityQueries.push({
                ...baseQuery,
                newValue: { in: values.map(v => JSON.stringify(v)) }
              });
            }
            break;
          default:
            // For actions without sub-conditions, just add the base query
            activityQueries.push(baseQuery);
            break;
        }
      } else {
        // For actions without sub-conditions, just add the base query
        activityQueries.push(baseQuery);
      }
    }

    // Execute queries and find intersection (AND logic) of issue IDs
    const queryResults: Set<string>[] = [];

    for (const query of activityQueries) {
      const activities = await prisma.issueActivity.findMany({
        where: query as any,
        select: { itemId: true, newValue: true },
        distinct: ['itemId']
      });
      // Collect issue IDs for this specific query
      const queryIssueIds = new Set<string>();
      activities.forEach(activity => queryIssueIds.add(activity.itemId));
      queryResults.push(queryIssueIds);
    }

    // Find intersection (AND logic): issues that appear in ALL query results
    let issueIds: string[] = [];

    if (queryResults.length === 0) {
      issueIds = [];
    } else if (queryResults.length === 1) {
      // Single filter - just return its results
      issueIds = Array.from(queryResults[0]);
    } else {
      // Multiple filters - find intersection
      const firstSet = queryResults[0];
      issueIds = Array.from(firstSet).filter(issueId =>
        queryResults.every(resultSet => resultSet.has(issueId))
      );
    }

    return NextResponse.json({ issueIds });

  } catch (error) {
    console.error('Error filtering issues by actions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
