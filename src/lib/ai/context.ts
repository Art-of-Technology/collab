import type { AIContext } from './assistant';

/**
 * Build AI context from current page and user data
 */
export function buildAIContext(params: {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role?: string;
  };
  workspace: {
    id: string;
    name: string;
    slug?: string | null;
  };
  currentPage?: {
    type: 'dashboard' | 'view' | 'issue' | 'project' | 'settings' | 'other';
    id?: string;
    name?: string;
    data?: Record<string, unknown>;
  };
  selection?: {
    issues?: string[];
    text?: string;
  };
  recentActivity?: {
    issues: Array<{ id: string; title: string; key: string }>;
    projects: Array<{ id: string; name: string }>;
  };
}): AIContext {
  return {
    user: {
      id: params.user.id,
      name: params.user.name || 'User',
      email: params.user.email || '',
      role: params.user.role,
    },
    workspace: {
      id: params.workspace.id,
      name: params.workspace.name,
      slug: params.workspace.slug || undefined,
    },
    currentPage: params.currentPage,
    selection: params.selection,
    recentActivity: params.recentActivity,
  };
}

/**
 * Build enriched context for a specific agent.
 * Now simplified - AI uses tools for data queries instead of pre-fetched context.
 */
export async function buildEnrichedContext(
  baseContext: AIContext,
  agentSlug: string,
  prisma: any
): Promise<AIContext> {
  const enriched = { ...baseContext };

  if (!enriched.currentPage) {
    enriched.currentPage = { type: 'other' };
  }

  // Only fetch minimal context - AI will use tools for detailed queries
  try {
    const overview = await getWorkspaceOverview(baseContext.workspace.id, prisma);
    enriched.currentPage = {
      ...enriched.currentPage,
      data: { overview },
    };
  } catch (error) {
    console.error('Error enriching context:', error);
  }

  return enriched;
}

// --- Enrichment data fetchers ---

async function getSprintContext(workspaceId: string, prisma: any) {
  try {
    // Get issues by status for sprint overview
    const statusCounts = await prisma.issue.groupBy({
      by: ['statusId'],
      where: { workspaceId },
      _count: true,
    });

    const overdueCount = await prisma.issue.count({
      where: {
        workspaceId,
        dueDate: { lt: new Date() },
        projectStatus: { isFinal: false },
      },
    });

    return { statusCounts, overdueCount };
  } catch {
    return null;
  }
}

async function getWorkloadContext(workspaceId: string, prisma: any) {
  try {
    // Get issue counts per assignee
    const assigneeCounts = await prisma.issue.groupBy({
      by: ['assigneeId'],
      where: {
        workspaceId,
        assigneeId: { not: null },
        projectStatus: { isFinal: false },
      },
      _count: true,
    });

    return { assigneeCounts };
  } catch {
    return null;
  }
}

async function getRecentChangesContext(workspaceId: string, prisma: any) {
  try {
    const recentActivities = await prisma.issueActivity.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        action: true,
        fieldName: true,
        oldValue: true,
        newValue: true,
        itemId: true,
        createdAt: true,
      },
    });

    return recentActivities;
  } catch {
    return [];
  }
}

async function getNavigationContext(workspaceId: string, prisma: any) {
  try {
    const [projects, views, recentIssues] = await Promise.all([
      prisma.project.findMany({
        where: {
          workspaceId,
          isArchived: { not: true },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          issuePrefix: true,
          color: true,
          _count: { select: { issues: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      prisma.view.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          description: true,
        },
        take: 20,
        orderBy: { accessCount: 'desc' },
      }),
      prisma.issue.findMany({
        where: { workspaceId },
        select: {
          id: true,
          issueKey: true,
          title: true,
          type: true,
          priority: true,
          project: { select: { name: true, issuePrefix: true } },
          projectStatus: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
    ]);

    return { projects, views, recentIssues };
  } catch (e) {
    console.error('Error fetching navigation context:', e);
    return null;
  }
}

async function getWorkspaceOverview(workspaceId: string, prisma: any) {
  try {
    const [issueCount, projectCount, memberCount] = await Promise.all([
      prisma.issue.count({ where: { workspaceId } }),
      prisma.project.count({ where: { workspaceId, isArchived: { not: true } } }),
      prisma.workspaceMember.count({ where: { workspaceId, status: true } }),
    ]);

    return { issueCount, projectCount, memberCount };
  } catch {
    return null;
  }
}

/**
 * Extract page context from pathname
 */
export function getPageContextFromPath(pathname: string): {
  type: 'dashboard' | 'view' | 'issue' | 'project' | 'settings' | 'other';
  id?: string;
} {
  const segments = pathname.split('/').filter(Boolean);

  // Skip workspace segment
  if (segments.length < 2) {
    return { type: 'other' };
  }

  const pageType = segments[1];
  const pageId = segments[2];

  switch (pageType) {
    case 'dashboard':
      return { type: 'dashboard' };
    case 'views':
      return { type: 'view', id: pageId };
    case 'issues':
    case 'issue':
      return { type: 'issue', id: pageId };
    case 'projects':
      return { type: 'project', id: pageId };
    case 'settings':
      return { type: 'settings' };
    default:
      return { type: 'other' };
  }
}

/**
 * Get contextual prompt based on current page
 */
export function getContextualPrompt(pageType: string): string {
  const prompts: Record<string, string> = {
    dashboard: 'What would you like help with? I can show you what needs attention, help create issues, or summarize team activity.',
    view: 'I can help you analyze this view, filter issues, or provide insights about the issues shown here.',
    issue: 'I can help you with this issue - find related issues, suggest solutions, or help write better descriptions.',
    project: 'I can help you manage this project - overview status, find blockers, or create new issues.',
    settings: 'Need help configuring something? I can explain settings or guide you through configuration.',
    other: 'How can I help you today?',
  };

  return prompts[pageType] || prompts.other;
}

/**
 * Get suggested actions based on context
 */
export function getSuggestedActions(context: AIContext): Array<{
  label: string;
  prompt: string;
  icon?: string;
}> {
  const actions: Array<{ label: string; prompt: string; icon?: string }> = [];

  switch (context.currentPage?.type) {
    case 'dashboard':
      actions.push(
        { label: 'What needs attention?', prompt: 'What needs my attention today?', icon: 'alert-circle' },
        { label: 'Team summary', prompt: 'Summarize team activity this week', icon: 'users' },
        { label: 'My tasks', prompt: 'Show my open tasks', icon: 'check-square' },
        { label: 'Create issue', prompt: 'Help me create a new issue', icon: 'plus' }
      );
      break;

    case 'view':
      actions.push(
        { label: 'Summarize view', prompt: 'Summarize the issues in this view', icon: 'file-text' },
        { label: 'Find blockers', prompt: 'Find blocked or at-risk items in this view', icon: 'alert-triangle' },
        { label: 'Prioritize', prompt: 'Help me prioritize these issues', icon: 'list-ordered' },
        { label: 'Filter help', prompt: 'Help me filter these issues', icon: 'filter' }
      );
      break;

    case 'issue':
      actions.push(
        { label: 'Related issues', prompt: 'Find issues related to this one', icon: 'link' },
        { label: 'Suggest solution', prompt: 'Suggest solutions based on similar issues', icon: 'lightbulb' },
        { label: 'Write criteria', prompt: 'Help me write acceptance criteria', icon: 'check-circle' },
        { label: 'Improve description', prompt: 'Help improve the description', icon: 'edit' }
      );
      break;

    case 'project':
      actions.push(
        { label: 'Project status', prompt: 'Give me a status overview of this project', icon: 'bar-chart' },
        { label: 'Find blockers', prompt: 'What are the blockers in this project?', icon: 'alert-triangle' },
        { label: 'Create issue', prompt: 'Create a new issue for this project', icon: 'plus' },
        { label: 'Sprint summary', prompt: 'Summarize the current sprint progress', icon: 'calendar' }
      );
      break;

    default:
      actions.push(
        { label: 'Create issue', prompt: 'Help me create a new issue', icon: 'plus' },
        { label: 'Search', prompt: 'Search for issues', icon: 'search' },
        { label: 'Dashboard', prompt: 'Take me to the dashboard', icon: 'home' },
        { label: 'Help', prompt: 'What can you help me with?', icon: 'help-circle' }
      );
  }

  return actions;
}

/**
 * Parse user message for intent
 */
export function parseUserIntent(message: string): {
  intent: 'create' | 'search' | 'update' | 'navigate' | 'summarize' | 'analyze' | 'question' | 'unknown';
  entities: Record<string, string>;
} {
  const lowerMessage = message.toLowerCase();
  const entities: Record<string, string> = {};

  // Extract issue keys (e.g., MA-123, PROJ-456)
  const issueKeyMatch = message.match(/[A-Z]+-\d+/g);
  if (issueKeyMatch) {
    entities.issueKeys = issueKeyMatch.join(',');
  }

  // Detect intent
  if (lowerMessage.includes('create') || lowerMessage.includes('new issue') || lowerMessage.includes('add')) {
    return { intent: 'create', entities };
  }

  if (lowerMessage.includes('search') || lowerMessage.includes('find') || lowerMessage.includes('show me') || lowerMessage.includes('where')) {
    return { intent: 'search', entities };
  }

  if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('set') || lowerMessage.includes('assign')) {
    return { intent: 'update', entities };
  }

  if (lowerMessage.includes('go to') || lowerMessage.includes('take me') || lowerMessage.includes('open') || lowerMessage.includes('navigate')) {
    return { intent: 'navigate', entities };
  }

  if (lowerMessage.includes('summarize') || lowerMessage.includes('summary') || lowerMessage.includes('overview')) {
    return { intent: 'summarize', entities };
  }

  if (lowerMessage.includes('analyze') || lowerMessage.includes('insight') || lowerMessage.includes('trend') || lowerMessage.includes('report')) {
    return { intent: 'analyze', entities };
  }

  if (lowerMessage.includes('what') || lowerMessage.includes('how') || lowerMessage.includes('why') || lowerMessage.includes('?')) {
    return { intent: 'question', entities };
  }

  return { intent: 'unknown', entities };
}
