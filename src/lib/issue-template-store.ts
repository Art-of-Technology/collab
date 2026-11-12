import { STANDARD_TEMPLATES, type IssueTemplate, type TemplatedIssueType } from '@/lib/issue-templates';

export interface WorkspaceTemplates {
  /** Whether agents are refused when something a template requires is missing. */
  enforced: boolean;
  templates: Record<TemplatedIssueType, IssueTemplate>;
}

/** The templates in force for a workspace. Until workspaces can edit them, these are the standards. */
export async function getWorkspaceTemplates(workspaceId: string): Promise<WorkspaceTemplates> {
  return { enforced: false, templates: STANDARD_TEMPLATES };
}
