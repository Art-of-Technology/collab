/**
 * Daily Standup Generation API
 *
 * POST /api/ai/agents/standup
 * Generate daily standup summaries
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStandupGenerator, type StandupContext } from '@/lib/ai/agents/daily-standup';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId,
      projectId,
      teamMembers,
      recentIssues,
      recentComments,
      sprintInfo,
      customInstructions,
      quick, // If true, generate quick standup
      options,
    } = body;

    // Validate required fields
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing required field: workspaceId' },
        { status: 400 }
      );
    }

    const generator = getStandupGenerator(options);

    // Quick standup from issues only
    if (quick && recentIssues) {
      const summary = await generator.generateQuickStandup(
        recentIssues.map((i: Record<string, unknown>) => ({
          id: i.id as string,
          identifier: i.identifier as string,
          title: i.title as string,
          status: i.status as string,
          priority: i.priority as string,
          type: i.type as string,
          assignee: i.assignee as string | undefined,
          createdAt: new Date(i.createdAt as string),
          updatedAt: new Date(i.updatedAt as string),
          completedAt: i.completedAt ? new Date(i.completedAt as string) : undefined,
          storyPoints: i.storyPoints as number | undefined,
        })),
        workspaceId
      );

      return NextResponse.json({
        success: true,
        summary,
        type: 'quick',
      });
    }

    // Full standup with context
    const context: StandupContext = {
      workspaceId,
      projectId,
      teamMembers,
      recentIssues: recentIssues?.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        identifier: i.identifier as string,
        title: i.title as string,
        status: i.status as string,
        priority: i.priority as string,
        type: i.type as string,
        assignee: i.assignee as string | undefined,
        createdAt: new Date(i.createdAt as string),
        updatedAt: new Date(i.updatedAt as string),
        completedAt: i.completedAt ? new Date(i.completedAt as string) : undefined,
        storyPoints: i.storyPoints as number | undefined,
      })),
      recentComments: recentComments?.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        issueIdentifier: c.issueIdentifier as string,
        issueTitle: c.issueTitle as string,
        authorName: c.authorName as string,
        content: c.content as string,
        createdAt: new Date(c.createdAt as string),
      })),
      sprintInfo: sprintInfo
        ? {
            id: sprintInfo.id,
            name: sprintInfo.name,
            startDate: new Date(sprintInfo.startDate),
            endDate: new Date(sprintInfo.endDate),
            totalPoints: sprintInfo.totalPoints,
            completedPoints: sprintInfo.completedPoints,
            issueCount: sprintInfo.issueCount,
            completedCount: sprintInfo.completedCount,
          }
        : undefined,
      customInstructions,
    };

    const standup = await generator.generateStandup(context);

    return NextResponse.json({
      success: true,
      standup,
      type: 'full',
    });
  } catch (error) {
    console.error('Standup generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate standup summary' },
      { status: 500 }
    );
  }
}
