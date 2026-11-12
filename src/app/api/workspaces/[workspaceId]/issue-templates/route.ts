import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { Permission, checkUserPermission } from '@/lib/permissions';
import { getWorkspaceTemplates, resetWorkspaceTemplate, saveWorkspaceTemplate } from '@/lib/issue-template-store';
import { TEMPLATED_TYPES, templateFor, validateTemplateInput, withBody, type TemplatedIssueType } from '@/lib/issue-templates';

export const dynamic = 'force-dynamic';

const canManageTemplates = async (userId: string, workspaceId: string) =>
  (await checkUserPermission(userId, workspaceId, Permission.MANAGE_WORKSPACE_SETTINGS)).hasPermission;

// GET /api/workspaces/[workspaceId]/issue-templates - the workspace's issue templates, for any member
export async function GET(_request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { workspaceId } = await params;
    if (!await userHasWorkspaceAccess(session.user.id, workspaceId)) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    const { enforced, templates } = await getWorkspaceTemplates(workspaceId);
    return NextResponse.json({
      enforced,
      canManage: await canManageTemplates(session.user.id, workspaceId),
      templates: TEMPLATED_TYPES.map(type => withBody(templates[type])),
    });
  } catch (error) {
    console.error('Error reading issue templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/workspaces/[workspaceId]/issue-templates - save one type's template, or reset it to the standard
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { workspaceId } = await params;
    if (!await canManageTemplates(session.user.id, workspaceId)) {
      return NextResponse.json({ error: 'You do not have permission to change issue templates' }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as { type?: unknown; reset?: unknown } | null;
    const type = typeof body?.type === 'string' ? body.type.toUpperCase() as TemplatedIssueType : null;
    if (!type || !templateFor((await getWorkspaceTemplates(workspaceId)).templates, type)) {
      return NextResponse.json({ error: `Choose an issue type that has a template: ${TEMPLATED_TYPES.join(', ')}.` }, { status: 400 });
    }
    if (body?.reset === true) return NextResponse.json({ template: withBody(await resetWorkspaceTemplate(workspaceId, type)) });
    const input = validateTemplateInput(body);
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
    return NextResponse.json({ template: withBody(await saveWorkspaceTemplate(workspaceId, type, input, session.user.id)) });
  } catch (error) {
    console.error('Error saving issue template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
