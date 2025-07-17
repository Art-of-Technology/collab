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

        // Get user's assigned tasks
        const tasks = await prisma.task.findMany({
            where: {
                assigneeId: user.id,
                status: {
                    not: 'Done'
                }
            },
            include: {
                taskBoard: {
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
            take: 10 // Limit to 10 tasks to avoid message being too long
        });

        if (tasks.length === 0) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `👋 Hi *${userName}*!\n🎉 Great news! You have no pending tasks assigned to you right now.`,
            });
        }

        // Count in-progress tasks
        const inProgressTasks = tasks.filter(task =>
            task.status?.toLowerCase().includes('progress') ||
            task.status?.toLowerCase().includes('doing') ||
            task.status === 'In Progress'
        );

        // Format tasks as clickable links
        const taskList = tasks.map(task => {
            const boardName = task.taskBoard?.name || 'Unknown Board';
            const taskKey = task.issueKey || `#${task.id.slice(-6)}`;
            // Create a clickable link with workspaceId/tasks/taskId format
            const taskUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.com'}/${task.workspace.id}/tasks/${task.id}`;
            return `• <${taskUrl}|${taskKey}: ${task.title}> (${boardName})`;
        }).join('\n');

        // Build the message
        let message = `👋 Hi *${userName}*!\nHere are your pending tasks:\n\n${taskList}`;

        // Add warning if multiple in-progress tasks
        if (inProgressTasks.length > 1) {
            message += `\n\n⚠️ *Note:* You have ${inProgressTasks.length} tasks in progress. Consider focusing on completing one task at a time for better productivity.`;
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
