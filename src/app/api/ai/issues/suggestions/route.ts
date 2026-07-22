import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface IssueSuggestion {
  id: string;
  type: 'priority' | 'assignee' | 'due_date' | 'label' | 'split' | 'link';
  title: string;
  description: string;
  confidence: number;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const issueId = searchParams.get("issueId");
    const workspaceId = searchParams.get("workspaceId");

    if (!issueId || !workspaceId) {
      return NextResponse.json({ error: "Issue ID and Workspace ID required" }, { status: 400 });
    }

    // Verify workspace access
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get the current issue with all related data
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        labels: true,
        assignee: true,
        project: {
          include: {
            members: {
              include: { user: true },
            },
          },
        },
        activities: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const suggestions: IssueSuggestion[] = [];

    // 1. Check for missing priority
    if (!issue.priority || issue.priority === 'none') {
      // Analyze title/description for urgency indicators
      const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
      const urgentKeywords = ['urgent', 'critical', 'blocker', 'asap', 'immediately', 'broken', 'down', 'crash'];
      const highKeywords = ['important', 'significant', 'major', 'serious'];

      const isUrgent = urgentKeywords.some(keyword => text.includes(keyword));
      const isHigh = highKeywords.some(keyword => text.includes(keyword));

      let suggestedPriority = 'medium';
      let confidence = 0.7;

      if (isUrgent) {
        suggestedPriority = 'urgent';
        confidence = 0.9;
      } else if (isHigh) {
        suggestedPriority = 'high';
        confidence = 0.85;
      }

      suggestions.push({
        id: 'suggest-priority',
        type: 'priority',
        title: `Consider setting priority to ${suggestedPriority}`,
        description: isUrgent
          ? 'Keywords in the title/description suggest this issue is urgent.'
          : isHigh
            ? 'This issue appears to be important based on its description.'
            : 'Setting a priority helps with planning and filtering.',
        confidence,
      });
    }

    // 2. Check for missing assignee
    if (!issue.assigneeId) {
      // Check if creator is a project member and could be assigned
      const projectMembers = issue.project?.members || [];
      const suggestAssignee = projectMembers.length > 0;

      suggestions.push({
        id: 'suggest-assignee',
        type: 'assignee',
        title: 'Assign this issue',
        description: suggestAssignee
          ? `This issue is unassigned. Consider assigning it to one of the ${projectMembers.length} project members.`
          : 'Unassigned issues may get overlooked. Consider assigning it to ensure accountability.',
        confidence: 0.85,
      });
    }

    // 3. Check for missing due date
    if (!issue.dueDate) {
      // Check if this is a high priority issue
      const isHighPriority = issue.priority === 'urgent' || issue.priority === 'high';

      suggestions.push({
        id: 'suggest-duedate',
        type: 'due_date',
        title: 'Set a due date',
        description: isHighPriority
          ? 'High priority issues should have a due date to track urgency.'
          : 'Adding a due date helps track progress and prioritize work.',
        confidence: isHighPriority ? 0.85 : 0.6,
      });
    }

    // 4. Check for missing labels
    if (!issue.labels || issue.labels.length === 0) {
      // Check workspace labels to suggest
      const workspaceLabels = await prisma.label.findMany({
        where: { workspaceId },
        take: 5,
      });

      const hasLabelsAvailable = workspaceLabels.length > 0;

      suggestions.push({
        id: 'suggest-labels',
        type: 'label',
        title: 'Add labels',
        description: hasLabelsAvailable
          ? `This issue has no labels. Your workspace has ${workspaceLabels.length} labels available for categorization.`
          : 'Labels help categorize and filter issues effectively.',
        confidence: 0.6,
      });
    }

    // 5. Check for overly complex issue (long description, many comments)
    const descriptionLength = issue.description?.length || 0;
    const commentCount = issue.comments?.length || 0;

    if (descriptionLength > 2000 || commentCount > 10) {
      suggestions.push({
        id: 'suggest-split',
        type: 'split',
        title: 'Consider splitting this issue',
        description: descriptionLength > 2000
          ? 'This issue has a lengthy description. Breaking it into smaller tasks could improve clarity and tracking.'
          : `This issue has ${commentCount}+ comments. It might benefit from being broken down into separate tasks.`,
        confidence: 0.7,
      });
    }

    // 6. Check for stale issue
    const lastActivity = issue.activities?.[0]?.createdAt;
    if (lastActivity) {
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceActivity > 14 && issue.status?.category !== 'completed') {
        suggestions.push({
          id: 'suggest-review',
          type: 'priority',
          title: 'Review this stale issue',
          description: `No activity in ${daysSinceActivity} days. Consider updating the status or reprioritizing.`,
          confidence: 0.75,
        });
      }
    }

    // 7. Suggest linking to related issues
    const similarIssuesCount = await prisma.issue.count({
      where: {
        project: { workspaceId },
        id: { not: issueId },
        title: { contains: issue.title.split(' ')[0], mode: 'insensitive' },
      },
    });

    if (similarIssuesCount > 0) {
      const existingLinks = await prisma.issueLink.count({
        where: {
          OR: [
            { sourceIssueId: issueId },
            { targetIssueId: issueId },
          ],
        },
      });

      if (existingLinks === 0) {
        suggestions.push({
          id: 'suggest-link',
          type: 'link',
          title: 'Link related issues',
          description: `Found ${similarIssuesCount} potentially related issues. Linking them can help track dependencies.`,
          confidence: 0.65,
        });
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Issue suggestions API error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
