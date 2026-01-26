/**
 * Sprint Health Monitoring API
 *
 * POST /api/ai/agents/sprint-health
 * Analyze sprint health and generate reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSprintHealthMonitor, type SprintData } from '@/lib/ai/agents/sprint-health';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sprint,
      quick, // If true, return quick health check
      options,
    } = body;

    // Validate required fields
    if (!sprint || !sprint.id || !sprint.name || !sprint.issues) {
      return NextResponse.json(
        { error: 'Missing required fields: sprint with id, name, and issues' },
        { status: 400 }
      );
    }

    // Build sprint data
    const sprintData: SprintData = {
      id: sprint.id,
      name: sprint.name,
      startDate: new Date(sprint.startDate),
      endDate: new Date(sprint.endDate),
      goals: sprint.goals,
      issues: sprint.issues.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        identifier: i.identifier as string,
        title: i.title as string,
        status: i.status as string,
        priority: i.priority as string,
        type: i.type as string,
        storyPoints: i.storyPoints as number | undefined,
        assigneeId: i.assigneeId as string | undefined,
        assigneeName: i.assigneeName as string | undefined,
        createdAt: new Date(i.createdAt as string),
        updatedAt: new Date(i.updatedAt as string),
        completedAt: i.completedAt ? new Date(i.completedAt as string) : undefined,
        blockedBy: i.blockedBy as string[] | undefined,
        labels: i.labels as string[] | undefined,
        daysInStatus: i.daysInStatus as number | undefined,
      })),
      teamCapacity: sprint.teamCapacity?.map((t: Record<string, unknown>) => ({
        memberId: t.memberId as string,
        memberName: t.memberName as string,
        totalCapacity: t.totalCapacity as number,
        allocatedCapacity: t.allocatedCapacity as number,
        availableDays: t.availableDays as number,
      })),
      previousSprints: sprint.previousSprints?.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        velocity: s.velocity as number,
        completionRate: s.completionRate as number,
        scopeChange: s.scopeChange as number,
      })),
    };

    const monitor = getSprintHealthMonitor(options);

    // Quick health check
    if (quick) {
      const healthCheck = monitor.quickHealthCheck(sprintData);
      return NextResponse.json({
        success: true,
        healthCheck,
        type: 'quick',
      });
    }

    // Full health report
    const report = await monitor.analyzeSprintHealth(sprintData);

    return NextResponse.json({
      success: true,
      report,
      type: 'full',
    });
  } catch (error) {
    console.error('Sprint health analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze sprint health' },
      { status: 500 }
    );
  }
}
