import { prisma } from '@/lib/prisma';
import {
  STANDARD_TEMPLATES, TEMPLATED_TYPES, validateTemplateInput,
  type IssueTemplate, type TemplateField, type TemplateSection, type TemplatedIssueType,
} from '@/lib/issue-templates';

export interface WorkspaceTemplates {
  /** Whether agents are refused when something a template requires is missing. */
  enforced: boolean;
  templates: Record<TemplatedIssueType, IssueTemplate>;
}

/** The templates in force for a workspace: the standards, replaced type by type where the workspace has its own. */
export async function getWorkspaceTemplates(workspaceId: string): Promise<WorkspaceTemplates> {
  const [workspace, rows] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { issueTemplatesEnforced: true } }),
    prisma.issueTemplate.findMany({ where: { workspaceId } }),
  ]);
  const templates = { ...STANDARD_TEMPLATES };
  for (const row of rows) {
    const type = row.issueType as TemplatedIssueType;
    const stored = validateTemplateInput({ sections: row.sections, requiredFields: row.requiredFields });
    // A stored template that no longer passes the checks gives way to the standard.
    if (TEMPLATED_TYPES.includes(type) && !('error' in stored)) templates[type] = { type, version: row.version, standard: false, ...stored };
  }
  return { enforced: workspace?.issueTemplatesEnforced ?? false, templates };
}

/** Switches the refusal of incomplete agent issues on or off for a workspace. */
export async function setTemplatesEnforced(workspaceId: string, enforced: boolean): Promise<void> {
  await prisma.workspace.update({ where: { id: workspaceId }, data: { issueTemplatesEnforced: enforced } });
}

/** Stores a workspace's own template for a type. `input` has already passed validateTemplateInput. */
export async function saveWorkspaceTemplate(
  workspaceId: string, type: TemplatedIssueType,
  input: { sections: TemplateSection[]; requiredFields: TemplateField[] }, userId: string,
): Promise<IssueTemplate> {
  const data = { sections: input.sections as object[], requiredFields: input.requiredFields, updatedById: userId };
  const row = await prisma.issueTemplate.upsert({
    where: { workspaceId_issueType: { workspaceId, issueType: type } },
    // The standard is version 1, so a workspace's first edit is version 2.
    create: { workspaceId, issueType: type, version: 2, ...data },
    update: { version: { increment: 1 }, ...data },
  });
  return { type, version: row.version, standard: false, ...input };
}

/** Removes a workspace's own template for a type, which brings the standard back. */
export async function resetWorkspaceTemplate(workspaceId: string, type: TemplatedIssueType): Promise<IssueTemplate> {
  await prisma.issueTemplate.deleteMany({ where: { workspaceId, issueType: type } });
  return STANDARD_TEMPLATES[type];
}
