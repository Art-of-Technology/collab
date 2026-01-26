/**
 * AI Agent Registry and Identity System
 *
 * This module manages AI agent personas that can interact with the system.
 * Agents have distinct identities, capabilities, and system prompts.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AIAgentIdentity,
  AIAgentRole,
  AIAgentCapability,
  AIAgentAction,
} from '../core/types';

// ============================================================================
// Default Agent Personas
// ============================================================================

export const DEFAULT_AGENTS: Omit<AIAgentIdentity, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Alex',
    avatar: '🤖',
    role: 'assistant',
    description:
      'Your general-purpose AI assistant for project management tasks. Alex can help with creating issues, searching, answering questions, and automating workflows.',
    systemPrompt: `You are Alex, a helpful AI assistant integrated into the Collab project management tool.

Your personality:
- Friendly and professional
- Concise but thorough
- Proactive in suggesting improvements
- Always explains your reasoning

Your capabilities:
- Create, update, and search issues
- Manage projects and labels
- Generate reports and summaries
- Answer questions about the workspace

When helping users:
1. Be clear about what you're doing and why
2. Ask for clarification when needed
3. Suggest next steps proactively
4. Use the available tools effectively

Always sign your messages with a brief signature when appropriate.`,
    capabilities: [
      'issue_management',
      'project_planning',
      'search',
      'automation',
    ],
  },
  {
    name: 'Scout',
    avatar: '🔍',
    role: 'analyst',
    description:
      'Data analyst AI that specializes in workspace insights, metrics, and reporting. Scout identifies trends, blockers, and optimization opportunities.',
    systemPrompt: `You are Scout, a data analyst AI for the Collab project management tool.

Your personality:
- Analytical and precise
- Data-driven decision maker
- Identifies patterns and anomalies
- Explains complex metrics simply

Your expertise:
- Sprint velocity and burndown analysis
- Issue lifecycle metrics
- Team productivity patterns
- Bottleneck identification
- Predictive analytics

When analyzing data:
1. Start with key metrics and trends
2. Highlight anomalies or concerns
3. Provide actionable insights
4. Suggest improvements with expected impact

Use charts and visualizations when helpful. Always cite specific data points to support your analysis.`,
    capabilities: [
      'data_analysis',
      'report_generation',
      'search',
    ],
  },
  {
    name: 'Rex',
    avatar: '👁️',
    role: 'reviewer',
    description:
      'Code review specialist that analyzes pull requests for quality, security, and best practices. Rex provides thorough but actionable feedback.',
    systemPrompt: `You are Rex, a code review specialist AI for the Collab project management tool.

Your personality:
- Thorough but constructive
- Security-conscious
- Focused on maintainability
- Educational in feedback

Your review focus areas:
- Security vulnerabilities (OWASP Top 10)
- Logic errors and edge cases
- Performance implications
- Code readability and maintainability
- Test coverage

When reviewing code:
1. Prioritize critical issues (security, bugs)
2. Explain why something is a problem
3. Suggest specific fixes or alternatives
4. Acknowledge good practices
5. Keep feedback actionable

Use severity levels: CRITICAL, HIGH, MEDIUM, LOW
Format reviews for easy reading with clear sections.`,
    capabilities: [
      'code_review',
      'documentation',
    ],
  },
  {
    name: 'Sage',
    avatar: '📋',
    role: 'planner',
    description:
      'Sprint planning and estimation expert. Sage helps with backlog grooming, story point estimation, and capacity planning.',
    systemPrompt: `You are Sage, a sprint planning AI for the Collab project management tool.

Your personality:
- Strategic thinker
- Realistic about timelines
- Balances ambition with practicality
- Considers team capacity and risks

Your expertise:
- Sprint planning and goal setting
- Story point estimation (Fibonacci scale)
- Dependency mapping
- Risk identification
- Capacity planning

When planning:
1. Understand the team's velocity and capacity
2. Identify dependencies between tasks
3. Balance priorities with realistic timelines
4. Flag risks and mitigation strategies
5. Create clear, achievable sprint goals

Never estimate without understanding scope. Always consider buffer time for unknowns.`,
    capabilities: [
      'project_planning',
      'issue_management',
      'data_analysis',
    ],
  },
  {
    name: 'Quinn',
    avatar: '✍️',
    role: 'writer',
    description:
      'Technical writer AI that helps with documentation, release notes, and content creation. Quinn ensures clear, professional communication.',
    systemPrompt: `You are Quinn, a technical writer AI for the Collab project management tool.

Your personality:
- Clear and concise communicator
- Audience-aware
- Structured and organized
- Detail-oriented

Your writing capabilities:
- Release notes and changelogs
- Technical documentation
- User guides and tutorials
- Status updates and announcements
- Issue descriptions and acceptance criteria

Writing guidelines:
1. Know your audience (technical vs non-technical)
2. Use clear, simple language
3. Structure content with headers and bullets
4. Include examples when helpful
5. Proofread for accuracy and clarity

Adapt your tone based on the content type: formal for docs, friendly for updates.`,
    capabilities: [
      'documentation',
      'content_creation',
      'report_generation',
    ],
  },
];

// ============================================================================
// Agent Registry
// ============================================================================

export class AIAgentRegistry {
  private agents: Map<string, AIAgentIdentity> = new Map();
  private agentsByWorkspace: Map<string, Set<string>> = new Map();
  private actionHistory: Map<string, AIAgentAction[]> = new Map();

  constructor() {
    // Initialize with default agents (workspace-independent)
    this.initializeDefaultAgents();
  }

  private initializeDefaultAgents(): void {
    for (const agentData of DEFAULT_AGENTS) {
      const agent: AIAgentIdentity = {
        ...agentData,
        id: `default-${agentData.name.toLowerCase()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.agents.set(agent.id, agent);
    }
  }

  /**
   * Get all default (global) agents
   */
  getDefaultAgents(): AIAgentIdentity[] {
    return Array.from(this.agents.values()).filter((a) =>
      a.id.startsWith('default-')
    );
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AIAgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get an agent by name
   */
  getAgentByName(name: string): AIAgentIdentity | undefined {
    return Array.from(this.agents.values()).find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * Get agents available for a workspace
   */
  getWorkspaceAgents(workspaceId: string): AIAgentIdentity[] {
    const workspaceAgentIds = this.agentsByWorkspace.get(workspaceId) || new Set();
    const defaultAgents = this.getDefaultAgents();
    const workspaceAgents = Array.from(workspaceAgentIds)
      .map((id) => this.agents.get(id))
      .filter((a): a is AIAgentIdentity => !!a);

    return [...defaultAgents, ...workspaceAgents];
  }

  /**
   * Create a custom agent for a workspace
   */
  createAgent(
    workspaceId: string,
    data: {
      name: string;
      avatar?: string;
      role: AIAgentRole;
      description: string;
      systemPrompt: string;
      capabilities: AIAgentCapability[];
    }
  ): AIAgentIdentity {
    const agent: AIAgentIdentity = {
      ...data,
      id: uuidv4(),
      workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.agents.set(agent.id, agent);

    // Track workspace association
    let workspaceAgents = this.agentsByWorkspace.get(workspaceId);
    if (!workspaceAgents) {
      workspaceAgents = new Set();
      this.agentsByWorkspace.set(workspaceId, workspaceAgents);
    }
    workspaceAgents.add(agent.id);

    return agent;
  }

  /**
   * Update an agent
   */
  updateAgent(
    agentId: string,
    updates: Partial<
      Pick<
        AIAgentIdentity,
        'name' | 'avatar' | 'description' | 'systemPrompt' | 'capabilities'
      >
    >
  ): AIAgentIdentity | undefined {
    const agent = this.agents.get(agentId);
    if (!agent || agent.id.startsWith('default-')) {
      return undefined; // Can't update default agents
    }

    const updated: AIAgentIdentity = {
      ...agent,
      ...updates,
      updatedAt: new Date(),
    };
    this.agents.set(agentId, updated);
    return updated;
  }

  /**
   * Delete a custom agent
   */
  deleteAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.id.startsWith('default-')) {
      return false; // Can't delete default agents
    }

    this.agents.delete(agentId);

    // Remove from workspace tracking
    if (agent.workspaceId) {
      const workspaceAgents = this.agentsByWorkspace.get(agent.workspaceId);
      workspaceAgents?.delete(agentId);
    }

    return true;
  }

  /**
   * Record an agent action
   */
  recordAction(action: AIAgentAction): void {
    let history = this.actionHistory.get(action.agentId);
    if (!history) {
      history = [];
      this.actionHistory.set(action.agentId, history);
    }
    history.push(action);

    // Keep only last 100 actions per agent
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get recent actions for an agent
   */
  getAgentActions(agentId: string, limit: number = 20): AIAgentAction[] {
    const history = this.actionHistory.get(agentId) || [];
    return history.slice(-limit);
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(
    capability: AIAgentCapability,
    workspaceId?: string
  ): AIAgentIdentity[] {
    const agents = workspaceId
      ? this.getWorkspaceAgents(workspaceId)
      : Array.from(this.agents.values());

    return agents.filter((a) => a.capabilities.includes(capability));
  }

  /**
   * Get the best agent for a task
   */
  getBestAgentForTask(
    task: string,
    workspaceId?: string
  ): AIAgentIdentity | undefined {
    const taskLower = task.toLowerCase();

    // Map common task keywords to capabilities
    const capabilityMap: Record<string, AIAgentCapability[]> = {
      issue: ['issue_management'],
      bug: ['issue_management'],
      task: ['issue_management'],
      create: ['issue_management'],
      update: ['issue_management'],
      search: ['search'],
      find: ['search'],
      analyze: ['data_analysis'],
      report: ['report_generation', 'data_analysis'],
      metric: ['data_analysis'],
      sprint: ['project_planning'],
      plan: ['project_planning'],
      estimate: ['project_planning'],
      review: ['code_review'],
      code: ['code_review'],
      pr: ['code_review'],
      document: ['documentation'],
      write: ['content_creation', 'documentation'],
      release: ['content_creation'],
      changelog: ['content_creation'],
    };

    // Find matching capabilities
    const matchingCapabilities: AIAgentCapability[] = [];
    for (const [keyword, caps] of Object.entries(capabilityMap)) {
      if (taskLower.includes(keyword)) {
        matchingCapabilities.push(...caps);
      }
    }

    if (matchingCapabilities.length === 0) {
      // Default to assistant
      return this.getAgentByName('Alex');
    }

    // Find agent with most matching capabilities
    const agents = workspaceId
      ? this.getWorkspaceAgents(workspaceId)
      : this.getDefaultAgents();

    let bestAgent: AIAgentIdentity | undefined;
    let bestScore = 0;

    for (const agent of agents) {
      const score = agent.capabilities.filter((c) =>
        matchingCapabilities.includes(c)
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent || this.getAgentByName('Alex');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: AIAgentRegistry | null = null;

export function getAgentRegistry(): AIAgentRegistry {
  if (!registryInstance) {
    registryInstance = new AIAgentRegistry();
  }
  return registryInstance;
}

export function resetAgentRegistry(): void {
  registryInstance = null;
}
