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

function parseCommand(text: string) {
    const workspaceMatch = text.match(/workspace:(\w+)/i);
    const projectMatch = text.match(/project:(\w+)/i);
    const priorityMatch = text.match(/priority:(high|medium|low|urgent)/i);
    const statusMatch = text.match(/status:(\w+)/i);
    const assigneeMatch = text.match(/assignee:(\w+)/i);
    const reporterMatch = text.match(/reporter:(\w+)/i);
    const dueDateMatch = text.match(/due:(\d{4}-\d{2}-\d{2})/i);
    const typeMatch = text.match(/type:(task|bug|feature|story|epic)/i);
    const descriptionMatch = text.match(/description:"([^"]+)"/i);
    
    const title = text
        .replace(/workspace:\w+/gi, '')
        .replace(/project:\w+/gi, '')
        .replace(/priority:(high|medium|low|urgent)/gi, '')
        .replace(/status:\w+/gi, '')
        .replace(/assignee:\w+/gi, '')
        .replace(/reporter:\w+/gi, '')
        .replace(/due:\d{4}-\d{2}-\d{2}/gi, '')
        .replace(/type:(task|bug|feature|story|epic)/gi, '')
        .replace(/description:"[^"]+"/gi, '')
        .trim();

    return {
        title: title || 'Untitled Issue',
        workspace: workspaceMatch?.[1],
        project: projectMatch?.[1],
        priority: priorityMatch?.[1]?.toUpperCase() || 'MEDIUM',
        status: statusMatch?.[1],
        assignee: assigneeMatch?.[1],
        reporter: reporterMatch?.[1],
        dueDate: dueDateMatch?.[1],
        type: typeMatch?.[1]?.toUpperCase() || 'TASK',
        description: descriptionMatch?.[1] || `Created from Slack by ${text.split(' ')[0] || 'User'}`
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await parseFormData(req);
        const { title, workspace, project, priority, status, assignee, reporter, dueDate, type, description } = parseCommand(body.text?.trim() || '');

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

        // Check if workspace and project are specified
        if (!workspace || !project) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ **Missing required parameters!**\n\n📋 **Usage:**\n\`/create-issue "Title" workspace:workspace-name project:project-name\`\n\n💡 **Example:**\n\`/create-issue "Fix login bug" workspace:weezboo project:collab priority:high status:open assignee:john\`\n\n🔧 **Available parameters:**\n• \`workspace:\` - Workspace slug (required)\n• \`project:\` - Project name (required)\n• \`priority:\` - high/medium/low/urgent\n• \`status:\` - Status name (e.g., "To Do", "In Progress", "Done")\n• \`assignee:\` - User name or email\n• \`reporter:\` - User name or email\n• \`due:\` - Due date (YYYY-MM-DD)\n• \`type:\` - task/bug/feature/story/epic\n• \`description:\` - Issue description`,
            });
        }

        // Get workspace
        const workspaceData = await prisma.workspace.findFirst({
            where: { slug: workspace },
            include: { projects: true }
        });

        if (!workspaceData) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ Workspace not found: ${workspace}`,
            });
        }

        // Get project
        const projectData = await prisma.project.findFirst({
            where: { 
                name: { contains: project, mode: 'insensitive' },
                workspaceId: workspaceData.id 
            }
        });

        if (!projectData) {
            return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ Project "${project}" not found in workspace "${workspaceData.name}"`,
            });
        }

        // Find assignee if specified
        let assigneeId = null;
        if (assignee) {
            const assigneeUser = await prisma.user.findFirst({
                where: { 
                    OR: [
                        { name: { contains: assignee, mode: 'insensitive' } },
                        { email: { contains: assignee, mode: 'insensitive' } }
                    ]
                },
                select: { id: true }
            });
            if (assigneeUser) {
                assigneeId = assigneeUser.id;
            }
        }

        // Find reporter if specified (default to current user)
        let reporterId = user.id;
        if (reporter) {
            const reporterUser = await prisma.user.findFirst({
                where: { 
                    OR: [
                        { name: { contains: reporter, mode: 'insensitive' } },
                        { email: { contains: reporter, mode: 'insensitive' } }
                    ]
                },
                select: { id: true }
            });
            if (reporterUser) {
                reporterId = reporterUser.id;
            }
        }

        // Find status if specified (default to project's default status)
        let statusId = null;
        if (status) {
            const statusData = await prisma.projectStatus.findFirst({
                where: { 
                    projectId: projectData.id,
                    OR: [
                        { name: { contains: status, mode: 'insensitive' } },
                        { displayName: { contains: status, mode: 'insensitive' } }
                    ]
                },
                select: { id: true }
            });
            if (statusData) {
                statusId = statusData.id;
            }
        } else {
            // Get default status for the project
            const defaultStatus = await prisma.projectStatus.findFirst({
                where: { 
                    projectId: projectData.id,
                    isDefault: true
                },
                select: { id: true }
            });
            if (defaultStatus) {
                statusId = defaultStatus.id;
            }
        }

        // Create issue 
        const issue = await prisma.issue.create({
            data: {
                title,
                description: description,
                type: type as any,
                priority: priority as any,
                statusId: statusId,
                projectId: projectData.id,
                workspaceId: workspaceData.id,
                reporterId: reporterId,
                assigneeId: assigneeId,
                dueDate: dueDate ? new Date(dueDate) : null,
            }
        });

        const issueUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://teams.weezboo.com'}/${workspaceData.slug}/issues/${issue.id}`;

        return NextResponse.json({
            response_type: 'in_channel',
            text: `✅ Issue created!\n📋 <${issueUrl}|${issue.issueKey}: ${title}>\n🏢 ${workspaceData.name} → ${projectData.name}`,
        });

    } catch (error) {
        console.error('Slack create-issue error:', error);
        return NextResponse.json({
            response_type: 'ephemeral',
            text: `❌ **Command failed!**\n\n🔍 **Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n💡 **Try again with:**\n\`/create-issue "Title" workspace:workspace-name project:project-name\``,
        });
    }
}

async function processIssueCreation(body: Record<string, string>, parsed: any) {
    try {
        console.log('🔍 Starting issue creation process...');
        console.log('📋 Parsed data:', parsed);

        // Find user by Slack ID
        const user = await prisma.user.findFirst({
            where: { slackId: body.user_id },
            select: { id: true, name: true }
        });

        if (!user) {
            console.log('❌ User not found for Slack ID:', body.user_id);
            return;
        }

        console.log('✅ User found:', user.name, user.id);

        // Get workspace (specified or default)
        const workspaceQuery = parsed.workspace 
            ? { slug: parsed.workspace }
            : { members: { some: { userId: user.id } } };
            
        const workspaceData = await prisma.workspace.findFirst({
            where: workspaceQuery,
            include: { projects: { take: 1 } }
        });

        if (!workspaceData) {
            console.log('❌ Workspace not found:', parsed.workspace);
            return;
        }

        console.log('✅ Workspace found:', workspaceData.name, workspaceData.id);

        // Get project (specified or default)
        const projectData = parsed.project
            ? await prisma.project.findFirst({
                where: { 
                    name: { contains: parsed.project, mode: 'insensitive' },
                    workspaceId: workspaceData.id 
                }
            })
            : workspaceData.projects[0];

        if (!projectData) {
            console.log('❌ Project not found in workspace:', workspaceData.name);
            return;
        }

        console.log('✅ Project found:', projectData.name, projectData.id);

        // Create issue
        const issue = await prisma.issue.create({
            data: {
                title: parsed.title,
                description: `Created from Slack by ${body.user_name}`,
                type: 'TASK',
                priority: parsed.priority as any,
                projectId: projectData.id,
                workspaceId: workspaceData.id,
                reporterId: user.id,
            }
        });

        console.log('✅ Issue created successfully:', issue.id);
        console.log('📁 Project:', projectData.name, 'ID:', projectData.id);
        console.log('🏢 Workspace:', workspaceData.name, 'ID:', workspaceData.id);
        console.log('📋 Issue Title:', parsed.title);

    } catch (error) {
        console.error('❌ Background issue creation failed:', error);
    }
}
