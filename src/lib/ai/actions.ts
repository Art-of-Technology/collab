import type { AIAction, AIContext } from './assistant';
import type { AgentCapability } from './agents/types';

/**
 * Action executor for AI assistant actions
 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  navigateTo?: string;
}

export interface ActionExecutor {
  execute(action: AIAction, context: AIContext): Promise<ActionResult>;
}

// Agent capability to action type mapping
const AGENT_ACTION_MAP: Record<string, AgentCapability[]> = {
  create_issue: ['create_issue'],
  update_issue: ['update_issue'],
  search: ['search'],
  navigate: ['navigate'],
  summarize: ['summarize'],
  analyze: ['analyze'],
  assign: ['assign'],
  sprint_report: ['sprint_report'],
  workload_balance: ['workload_balance'],
  triage: ['triage'],
};

/**
 * Get allowed action types for a given agent slug.
 */
export function getAgentActions(agentSlug: string): string[] {
  const AGENT_CAPABILITIES: Record<string, string[]> = {
    alex: ['search', 'navigate', 'summarize', 'analyze'],
    nova: ['create_issue', 'update_issue', 'search', 'assign', 'sprint_report', 'workload_balance', 'triage'],
  };

  return AGENT_CAPABILITIES[agentSlug] || ['search', 'navigate'];
}

/**
 * Check if an agent can execute a specific action type.
 */
export function canAgentExecute(agentSlug: string, actionType: string): boolean {
  const allowedActions = getAgentActions(agentSlug);
  return allowedActions.includes(actionType);
}

/**
 * Create issue action handler
 */
export async function executeCreateIssue(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const response = await fetch('/api/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: context.workspace.id,
        title: params.title as string,
        description: params.description as string,
        type: params.type || 'TASK',
        priority: params.priority || 'medium',
        projectId: params.projectId,
        assigneeId: params.assigneeId,
        labels: params.labels,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Failed to create issue: ${error}` };
    }

    const issue = await response.json();
    return {
      success: true,
      message: `Created issue ${issue.issueKey}: ${issue.title}`,
      data: issue,
      navigateTo: `/${context.workspace.slug || context.workspace.id}/issues/${issue.issueKey}`,
    };
  } catch (error) {
    console.error('Error creating issue:', error);
    return { success: false, message: 'Failed to create issue. Please try again.' };
  }
}

/**
 * Update issue action handler
 */
export async function executeUpdateIssue(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const issueId = params.issueId || params.issueKey;
    if (!issueId) {
      return { success: false, message: 'Issue ID or key is required for update' };
    }

    const updateData: Record<string, unknown> = {};
    if (params.title) updateData.title = params.title;
    if (params.description) updateData.description = params.description;
    if (params.status) updateData.status = params.status;
    if (params.priority) updateData.priority = params.priority;
    if (params.assigneeId) updateData.assigneeId = params.assigneeId;
    if (params.dueDate) updateData.dueDate = params.dueDate;

    const response = await fetch(`/api/issues/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Failed to update issue: ${error}` };
    }

    const issue = await response.json();
    return { success: true, message: `Updated issue ${issue.issueKey}`, data: issue };
  } catch (error) {
    console.error('Error updating issue:', error);
    return { success: false, message: 'Failed to update issue. Please try again.' };
  }
}

/**
 * Search action handler
 */
export async function executeSearch(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const searchParams = new URLSearchParams();
    searchParams.set('workspaceId', context.workspace.id);

    if (params.query) searchParams.set('q', params.query as string);
    if (params.status) searchParams.set('status', params.status as string);
    if (params.priority) searchParams.set('priority', params.priority as string);
    if (params.type) searchParams.set('type', params.type as string);
    if (params.assigneeId) searchParams.set('assigneeId', params.assigneeId as string);
    if (params.projectId) searchParams.set('projectId', params.projectId as string);
    if (params.isOverdue) searchParams.set('isOverdue', 'true');

    const response = await fetch(`/api/issues/search?${searchParams.toString()}`);

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Search failed: ${error}` };
    }

    const results = await response.json();
    return {
      success: true,
      message: `Found ${results.issues?.length || 0} issues`,
      data: results,
    };
  } catch (error) {
    console.error('Error searching:', error);
    return { success: false, message: 'Search failed. Please try again.' };
  }
}

/**
 * Navigate action handler
 */
export function executeNavigate(
  params: Record<string, unknown>,
  context: AIContext
): ActionResult {
  const workspaceBase = `/${context.workspace.slug || context.workspace.id}`;

  let navigateTo: string;

  switch (params.path) {
    case 'dashboard':
      navigateTo = `${workspaceBase}/dashboard`;
      break;
    case 'issues':
    case 'my-issues':
      navigateTo = `${workspaceBase}/views/my-issues`;
      break;
    case 'overdue':
    case 'overdue-issues':
      navigateTo = `${workspaceBase}/views/overdue`;
      break;
    case 'projects':
      navigateTo = `${workspaceBase}/projects`;
      break;
    case 'views':
      navigateTo = `${workspaceBase}/views`;
      break;
    case 'settings':
      navigateTo = `${workspaceBase}/settings`;
      break;
    default:
      if (params.issueKey) {
        navigateTo = `${workspaceBase}/issues/${params.issueKey}`;
      } else if (params.projectId || params.projectSlug) {
        navigateTo = `${workspaceBase}/projects/${params.projectSlug || params.projectId}`;
      } else if (params.viewId || params.viewSlug) {
        navigateTo = `${workspaceBase}/views/${params.viewSlug || params.viewId}`;
      } else if (typeof params.path === 'string') {
        navigateTo = params.path.startsWith('/') ? params.path : `${workspaceBase}/${params.path}`;
      } else {
        return { success: false, message: 'Invalid navigation destination' };
      }
  }

  return { success: true, message: 'Navigating...', navigateTo };
}

/**
 * Summarize action handler
 */
export async function executeSummarize(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const response = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: context.workspace.id,
        type: params.type || 'general',
        projectId: params.projectId,
        viewId: params.viewId,
        issueIds: params.issueIds,
      }),
    });

    if (!response.ok) {
      return { success: false, message: 'Failed to generate summary' };
    }

    const result = await response.json();
    return { success: true, message: result.summary, data: result };
  } catch (error) {
    console.error('Error generating summary:', error);
    return { success: false, message: 'Failed to generate summary. Please try again.' };
  }
}

/**
 * Analyze action handler
 */
export async function executeAnalyze(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: context.workspace.id,
        type: params.type || 'general',
        projectId: params.projectId,
        viewId: params.viewId,
        dateRange: params.dateRange,
      }),
    });

    if (!response.ok) {
      return { success: false, message: 'Failed to generate analysis' };
    }

    const result = await response.json();
    return { success: true, message: result.analysis, data: result };
  } catch (error) {
    console.error('Error generating analysis:', error);
    return { success: false, message: 'Failed to generate analysis. Please try again.' };
  }
}

/**
 * Assign issue action handler (Nova-specific)
 */
export async function executeAssign(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const issueId = params.issueId;
    const assigneeId = params.assigneeId;
    if (!issueId || !assigneeId) {
      return { success: false, message: 'Issue ID and assignee ID are required' };
    }

    const response = await fetch(`/api/issues/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId }),
    });

    if (!response.ok) {
      return { success: false, message: 'Failed to assign issue' };
    }

    const issue = await response.json();
    return {
      success: true,
      message: `Assigned ${issue.issueKey} to team member`,
      data: issue,
    };
  } catch (error) {
    console.error('Error assigning issue:', error);
    return { success: false, message: 'Failed to assign issue. Please try again.' };
  }
}

/**
 * Sprint report action handler (Nova-specific)
 */
export async function executeSprintReport(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const response = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: context.workspace.id,
        type: 'sprint',
        projectId: params.projectId,
      }),
    });

    if (!response.ok) {
      return { success: false, message: 'Failed to generate sprint report' };
    }

    const result = await response.json();
    return { success: true, message: result.summary, data: result };
  } catch (error) {
    console.error('Error generating sprint report:', error);
    return { success: false, message: 'Failed to generate sprint report. Please try again.' };
  }
}

/**
 * Workload balance action handler (Nova-specific)
 */
export async function executeWorkloadBalance(
  params: Record<string, unknown>,
  context: AIContext
): Promise<ActionResult> {
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: context.workspace.id,
        type: 'workload',
        projectId: params.projectId,
      }),
    });

    if (!response.ok) {
      return { success: false, message: 'Failed to analyze workload' };
    }

    const result = await response.json();
    return { success: true, message: result.analysis, data: result };
  } catch (error) {
    console.error('Error analyzing workload:', error);
    return { success: false, message: 'Failed to analyze workload. Please try again.' };
  }
}

/**
 * Main action executor with agent capability checking.
 */
export async function executeAction(
  action: AIAction,
  context: AIContext,
  agentSlug?: string
): Promise<ActionResult> {
  // Validate agent can execute this action
  if (agentSlug && !canAgentExecute(agentSlug, action.type)) {
    return {
      success: false,
      message: `This agent doesn't have permission to perform ${action.type} actions.`,
    };
  }

  switch (action.type) {
    case 'create_issue':
      return executeCreateIssue(action.params, context);
    case 'update_issue':
      return executeUpdateIssue(action.params, context);
    case 'search':
      return executeSearch(action.params, context);
    case 'navigate':
      return executeNavigate(action.params, context);
    case 'summarize':
      return executeSummarize(action.params, context);
    case 'analyze':
      return executeAnalyze(action.params, context);
    case 'assign':
      return executeAssign(action.params, context);
    case 'sprint_report':
      return executeSprintReport(action.params, context);
    case 'workload_balance':
      return executeWorkloadBalance(action.params, context);
    default:
      return { success: false, message: `Unknown action type: ${action.type}` };
  }
}

/**
 * Validate action parameters
 */
export function validateActionParams(
  actionType: string,
  params: Record<string, unknown>
): { valid: boolean; missingFields?: string[] } {
  const requiredFields: Record<string, string[]> = {
    create_issue: ['title'],
    update_issue: ['issueId'],
    search: [],
    navigate: ['path'],
    summarize: [],
    analyze: [],
    assign: ['issueId', 'assigneeId'],
    sprint_report: [],
    workload_balance: [],
    triage: [],
  };

  const required = requiredFields[actionType] || [];
  const missing = required.filter((field) => !params[field]);

  return {
    valid: missing.length === 0,
    missingFields: missing.length > 0 ? missing : undefined,
  };
}
