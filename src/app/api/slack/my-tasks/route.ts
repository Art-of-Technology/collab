import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

async function parseFormData(req: NextRequest): Promise<Record<string, string>> {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
        result[key] = value;
    }
    return result;
}

export async function POST(req: NextRequest) {
    try {
        const body = await parseFormData(req);

        const slackUserId = body.user_id;
        const userName = body.user_name;

        // Find user by Slack ID
        const user = await prisma.user.findFirst({
            where: {
                slackId: slackUserId
            },
            select: {
                id: true,
                name: true
            }
        });

        if (!user) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ Sorry, I couldn't find your account linked to this Slack user. Please make sure your Slack account is connected to your profile.`,
            });
        }

        // Get user's assigned issues
        const issues = await prisma.issue.findMany({
            where: {
                assigneeId: user.id,
                statusValue: {
                    not: 'Done'
                }
            },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                workspace: {
                    select: {
                        id: true
                    }
                }
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 10 // Limit to 10 issues to avoid message being too long
        });

        if (issues.length === 0) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `👋 Hi *${userName}*!\n🎉 Great news! You have no pending issues assigned to you right now.`,
            });
        }

        // Count in-progress issues
        const inProgressIssues = issues.filter(issue =>
            issue.statusValue?.toLowerCase().includes('progress') ||
            issue.statusValue?.toLowerCase().includes('doing') ||
            issue.statusValue === 'In Progress'
        );

        // Format issues as clickable links
        const issueList = issues.map(issue => {
            const projectName = issue.project?.name || 'Unknown Project';
            const issueKey = issue.issueKey || `#${issue.id.slice(-6)}`;
            // Create a clickable link with workspaceId/issues/issueId format
            const issueUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.com'}/${issue.workspace.id}/issues/${issue.id}`;
            return `• <${issueUrl}|${issueKey}: ${issue.title}> (${projectName})`;
        }).join('\n');

        // Build the message
        let message = `👋 Hi *${userName}*!\nHere are your pending issues:\n\n${issueList}`;

        // Add warning if multiple in-progress issues
        if (inProgressIssues.length > 1) {
            message += `\n\n⚠️ *Note:* You have ${inProgressIssues.length} issues in progress. Consider focusing on completing one issue at a time for better productivity.`;
        }

        return NextResponse.json({
            response_type: 'ephemeral',
            text: message,
        });
    } catch (error) {
        console.error('Slack command error:', error);
        return NextResponse.json({
            response_type: 'ephemeral',
            text: '❌ Sorry, there was an error retrieving your tasks. Please try again later.',
        });
    }
}
