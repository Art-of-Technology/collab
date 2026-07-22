import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Initialize AI clients
function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const SUMMARIZE_PROMPT = `You are a project management assistant. Generate a concise, actionable summary based on the provided data.

Guidelines:
- Be brief but comprehensive
- Highlight key metrics and trends
- Call out items needing attention (overdue, blocked, high priority)
- Use bullet points for clarity
- Keep the tone professional and helpful
- Include specific issue keys when relevant`;

async function generateSummary(prompt: string, data: string): Promise<string> {
  const anthropic = getAnthropicClient();
  const openai = getOpenAIClient();

  const fullPrompt = `${prompt}\n\nData to summarize:\n${data}`;

  // Try Anthropic first
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: fullPrompt }],
      });
      return response.content[0].type === 'text' ? response.content[0].text : '';
    } catch (e) {
      console.log('Anthropic failed, trying OpenAI');
    }
  }

  // Fall back to OpenAI
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SUMMARIZE_PROMPT },
          { role: 'user', content: data },
        ],
      });
      return response.choices[0]?.message?.content || '';
    } catch (e) {
      console.error('OpenAI also failed:', e);
    }
  }

  throw new Error('No AI provider available');
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, type, projectId, viewId, issueIds } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
    }

    // Verify workspace access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId: currentUser.id } }
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let summary: string;
    let data: any;

    switch (type) {
      case 'project': {
        if (!projectId) {
          return NextResponse.json({ error: "Project ID required" }, { status: 400 });
        }

        const project = await prisma.project.findFirst({
          where: { id: projectId, workspaceId },
          include: {
            issues: {
              select: {
                id: true,
                title: true,
                issueKey: true,
                status: true,
                priority: true,
                dueDate: true,
                assignee: { select: { name: true } },
              },
              take: 50,
            },
            _count: { select: { issues: true } },
          }
        });

        if (!project) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const now = new Date();
        const overdue = project.issues.filter(i => i.dueDate && new Date(i.dueDate) < now);
        const highPriority = project.issues.filter(i => i.priority === 'high' || i.priority === 'urgent');
        const unassigned = project.issues.filter(i => !i.assignee);

        data = JSON.stringify({
          projectName: project.name,
          totalIssues: project._count.issues,
          overdueCount: overdue.length,
          overdueIssues: overdue.slice(0, 5).map(i => `${i.issueKey}: ${i.title}`),
          highPriorityCount: highPriority.length,
          unassignedCount: unassigned.length,
          recentIssues: project.issues.slice(0, 10).map(i => ({
            key: i.issueKey,
            title: i.title,
            status: i.status,
            priority: i.priority,
          })),
        }, null, 2);

        summary = await generateSummary(
          `${SUMMARIZE_PROMPT}\n\nGenerate a project status summary.`,
          data
        );
        break;
      }

      case 'view': {
        if (!viewId) {
          return NextResponse.json({ error: "View ID required" }, { status: 400 });
        }

        const view = await prisma.view.findFirst({
          where: { id: viewId, workspaceId },
        });

        if (!view) {
          return NextResponse.json({ error: "View not found" }, { status: 404 });
        }

        const issues = await prisma.issue.findMany({
          where: {
            workspaceId,
            projectId: view.projectIds.length > 0 ? { in: view.projectIds } : undefined,
          },
          select: {
            id: true,
            title: true,
            issueKey: true,
            status: true,
            priority: true,
            dueDate: true,
            assignee: { select: { name: true } },
            type: true,
          },
          take: 100,
        });

        const now = new Date();
        const statusGroups: Record<string, number> = {};
        const priorityGroups: Record<string, number> = {};

        issues.forEach(issue => {
          statusGroups[issue.status || 'Unknown'] = (statusGroups[issue.status || 'Unknown'] || 0) + 1;
          priorityGroups[issue.priority || 'None'] = (priorityGroups[issue.priority || 'None'] || 0) + 1;
        });

        data = JSON.stringify({
          viewName: view.name,
          totalIssues: issues.length,
          byStatus: statusGroups,
          byPriority: priorityGroups,
          overdueCount: issues.filter(i => i.dueDate && new Date(i.dueDate) < now).length,
          unassignedCount: issues.filter(i => !i.assignee).length,
          sampleIssues: issues.slice(0, 10).map(i => ({
            key: i.issueKey,
            title: i.title,
            status: i.status,
            priority: i.priority,
          })),
        }, null, 2);

        summary = await generateSummary(
          `${SUMMARIZE_PROMPT}\n\nGenerate a view summary.`,
          data
        );
        break;
      }

      case 'issues': {
        if (!issueIds || issueIds.length === 0) {
          return NextResponse.json({ error: "Issue IDs required" }, { status: 400 });
        }

        const issues = await prisma.issue.findMany({
          where: {
            id: { in: issueIds },
            workspaceId,
          },
          select: {
            id: true,
            title: true,
            issueKey: true,
            description: true,
            status: true,
            priority: true,
            type: true,
            dueDate: true,
            assignee: { select: { name: true } },
          },
        });

        data = JSON.stringify({
          issueCount: issues.length,
          issues: issues.map(i => ({
            key: i.issueKey,
            title: i.title,
            description: i.description?.slice(0, 200),
            status: i.status,
            priority: i.priority,
            type: i.type,
            assignee: i.assignee?.name,
          })),
        }, null, 2);

        summary = await generateSummary(
          `${SUMMARIZE_PROMPT}\n\nSummarize these issues, highlighting common themes and priorities.`,
          data
        );
        break;
      }

      case 'team':
      case 'general':
      default: {
        // General workspace summary
        const [issueStats, recentActivity] = await Promise.all([
          prisma.issue.groupBy({
            by: ['status'],
            where: { workspaceId },
            _count: true,
          }),
          prisma.issue.findMany({
            where: { workspaceId },
            orderBy: { updatedAt: 'desc' },
            take: 20,
            select: {
              issueKey: true,
              title: true,
              status: true,
              priority: true,
              updatedAt: true,
              assignee: { select: { name: true } },
            },
          }),
        ]);

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentlyUpdated = recentActivity.filter(i => new Date(i.updatedAt) > weekAgo);

        data = JSON.stringify({
          statusBreakdown: issueStats.map(s => ({ status: s.status, count: s._count })),
          totalIssues: issueStats.reduce((sum, s) => sum + s._count, 0),
          recentlyUpdatedCount: recentlyUpdated.length,
          recentActivity: recentlyUpdated.slice(0, 10).map(i => ({
            key: i.issueKey,
            title: i.title,
            status: i.status,
            assignee: i.assignee?.name,
          })),
        }, null, 2);

        summary = await generateSummary(
          `${SUMMARIZE_PROMPT}\n\nGenerate a workspace/team activity summary.`,
          data
        );
        break;
      }
    }

    return NextResponse.json({
      summary,
      type,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in summarize API:', error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
