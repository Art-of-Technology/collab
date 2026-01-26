/**
 * Auto-Assign API Route
 *
 * Suggests the best team members to assign an issue to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  getAutoAssignService,
  type TeamMember,
  type IssueForAssignment,
} from '@/lib/ai/automation';

interface AssignSuggestionRequest {
  issue: IssueForAssignment;
  teamMembers: TeamMember[];
  options?: {
    maxSuggestions?: number;
    considerWorkload?: boolean;
  };
}

interface WorkloadRequest {
  teamMembers: TeamMember[];
  assignedIssues: Array<{
    assigneeId: string;
    status: string;
    priority: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body: AssignSuggestionRequest = await req.json();
    const { issue, teamMembers, options } = body;

    if (!issue || !issue.title) {
      return NextResponse.json(
        { error: 'Issue with title is required' },
        { status: 400 }
      );
    }

    if (!teamMembers || !Array.isArray(teamMembers) || teamMembers.length === 0) {
      return NextResponse.json(
        { error: 'Team members array is required' },
        { status: 400 }
      );
    }

    // Get auto-assign service
    const assignService = getAutoAssignService();

    // Get suggestions
    const result = await assignService.suggestAssignees(
      issue,
      teamMembers,
      options
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in auto-assign:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to suggest assignees' },
      { status: 500 }
    );
  }
}

/**
 * GET - Analyze team workload
 */
export async function PUT(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body: WorkloadRequest = await req.json();
    const { teamMembers, assignedIssues } = body;

    if (!teamMembers || !Array.isArray(teamMembers)) {
      return NextResponse.json(
        { error: 'Team members array is required' },
        { status: 400 }
      );
    }

    // Get auto-assign service
    const assignService = getAutoAssignService();

    // Analyze workload
    const workloadAnalysis = assignService.analyzeWorkload(
      teamMembers,
      assignedIssues || []
    );

    const balanceCheck = assignService.isWorkloadBalanced(workloadAnalysis);

    return NextResponse.json({
      workload: workloadAnalysis,
      balance: balanceCheck,
    });
  } catch (error) {
    console.error('Error analyzing workload:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to analyze workload' },
      { status: 500 }
    );
  }
}
