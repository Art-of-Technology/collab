import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AgentDefinition, AgentAction, AgentSuggestion } from './agents/types';
import { getAgent, getDefaultAgent } from './agents/registry';
// Tools removed — MCP connector handles tools now via stream route
// Legacy stubs for streamResponse backward compat (method is effectively dead code)
const AI_TOOLS: never[] = [];
const executeTool = async (): Promise<string> => JSON.stringify({ error: true, message: 'Legacy tools removed. Use /api/ai/chat/stream with MCP connector.' });

// Types for AI Assistant
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentSlug?: string;
  metadata?: {
    action?: AIAction;
    suggestions?: AISuggestion[];
    context?: AIContext;
    cards?: Array<{ type: string; data: Record<string, unknown> }>;
  };
}

export interface AIAction {
  type: 'create_issue' | 'update_issue' | 'search' | 'navigate' | 'summarize' | 'analyze' | 'suggest' | 'assign' | 'sprint_report' | 'workload_balance' | 'triage';
  params: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
}

export interface AISuggestion {
  id: string;
  type: 'quick_action' | 'issue' | 'view' | 'insight';
  title: string;
  description: string;
  action?: AIAction;
  priority?: 'high' | 'medium' | 'low';
}

export interface AIContext {
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  workspace: {
    id: string;
    name: string;
    slug?: string;
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
}

export interface AIAssistantConfig {
  provider: 'anthropic' | 'openai';
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Multi-agent AI Assistant - creates per-request instances with agent-specific system prompts.
 */
export class AgentAssistant {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private config: AIAssistantConfig;
  private agent: AgentDefinition | null = null;

  constructor(config: AIAssistantConfig = { provider: 'anthropic' }) {
    this.config = {
      provider: config.provider || 'anthropic',
      model: config.model || (config.provider === 'openai' ? 'gpt-4-turbo-preview' : 'claude-sonnet-4-6'),
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2048,
    };

    this.initializeClient();
  }

  private initializeClient() {
    if (this.config.provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        this.anthropic = new Anthropic({ apiKey });
      }
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        this.openai = new OpenAI({ apiKey });
      }
    }
  }

  /**
   * Load an agent definition for this assistant instance.
   */
  async loadAgent(agentSlug?: string, prisma?: any): Promise<AgentDefinition> {
    if (agentSlug) {
      const agent = await getAgent(agentSlug, prisma);
      if (agent) {
        this.agent = agent;
        return agent;
      }
    }
    this.agent = await getDefaultAgent(prisma);
    return this.agent;
  }

  /**
   * Send a message to the AI assistant with agent-specific behavior.
   */
  async chat(
    userMessage: string,
    context: AIContext,
    options?: {
      agentSlug?: string;
      conversationHistory?: AIMessage[];
      prisma?: any;
    }
  ): Promise<AIMessage> {
    // Load agent if not already loaded
    if (!this.agent || (options?.agentSlug && options.agentSlug !== this.agent.slug)) {
      await this.loadAgent(options?.agentSlug, options?.prisma);
    }

    try {
      const response = await this.generateResponse(
        userMessage,
        context,
        options?.conversationHistory || []
      );

      const assistantMsg: AIMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        agentSlug: this.agent?.slug,
        metadata: {
          action: response.action,
          suggestions: response.suggestions,
        },
      };

      return assistantMsg;
    } catch (error) {
      console.error('AI Assistant error:', error);

      return {
        id: this.generateId(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        agentSlug: this.agent?.slug,
      };
    }
  }

  // Store prisma reference for tool execution
  private prisma: any = null;
  private workspaceId: string = '';
  private workspaceSlug: string = '';
  private userId: string = '';

  /**
   * Set context for tool execution
   */
  setToolContext(prisma: any, workspaceId: string, workspaceSlug?: string, userId?: string) {
    this.prisma = prisma;
    this.workspaceId = workspaceId;
    this.workspaceSlug = workspaceSlug || '';
    this.userId = userId || '';
  }

  /**
   * Generate a streaming response with tool support.
   * Returns an async iterable of text chunks and handles tool calls internally.
   */
  async *streamResponse(
    userMessage: string,
    context: AIContext,
    conversationHistory: AIMessage[] = []
  ): AsyncGenerator<string, void, unknown> {
    if (!this.agent) {
      await this.loadAgent();
    }

    const systemPrompt = this.buildSystemPromptWithTools();
    const contextPrompt = this.buildContextPrompt(context);
    const fullPrompt = `${contextPrompt}\n\nUser message: ${userMessage}`;

    if (this.config.provider === 'anthropic' && this.anthropic) {
      // Build messages for the conversation
      let messages: Anthropic.MessageParam[] = this.buildAnthropicMessages(conversationHistory, fullPrompt);
      let continueLoop = true;

      while (continueLoop) {
        const response = await this.anthropic.messages.create({
          model: this.config.model || 'claude-sonnet-4-6',
          max_tokens: this.config.maxTokens || 2048,
          system: systemPrompt,
          messages,
          tools: AI_TOOLS,
        });

        // Process each content block
        for (const block of response.content) {
          if (block.type === 'text') {
            // Yield text content in chunks for smooth streaming effect
            const text = block.text;
            const chunkSize = 10;
            for (let i = 0; i < text.length; i += chunkSize) {
              yield text.slice(i, i + chunkSize);
              // Small delay for streaming effect
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          } else if (block.type === 'tool_use') {
            // Execute the tool
            const toolName = block.name;
            const toolInput = block.input as Record<string, unknown>;

            // Yield a status message
            yield `\n\n*Searching ${toolName.replace(/_/g, ' ')}...*\n\n`;

            // Execute the tool with error handling
            let result: string;
            try {
              result = await executeTool(toolName, toolInput, {
                workspaceId: context.workspace.id,
                workspaceSlug: this.workspaceSlug || context.workspace.slug,
                userId: this.userId || context.user.id,
                prisma: this.prisma,
              });
            } catch (error) {
              console.error(`Error executing tool ${toolName}:`, error);
              result = JSON.stringify({
                error: true,
                message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              });
            }

            // Add the assistant's response and tool result to messages
            messages = [
              ...messages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: result,
                  },
                ],
              },
            ];
          }
        }

        // Check if we need to continue (tool use requires another round)
        if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
          continueLoop = false;
        } else if (response.stop_reason !== 'tool_use') {
          continueLoop = false;
        }
        // If stop_reason is 'tool_use', we continue the loop to get the final response
      }
    } else if (this.config.provider === 'openai' && this.openai) {
      // OpenAI streaming without tools (fallback)
      const messages = this.buildOpenAIMessages(this.agent?.systemPrompt || '', conversationHistory, fullPrompt);

      const stream = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4-turbo-preview',
        max_tokens: this.config.maxTokens || 2048,
        temperature: this.config.temperature || 0.7,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          yield text;
        }
      }
    } else {
      throw new Error('No AI provider configured');
    }
  }

  /**
   * Build system prompt with tool instructions
   */
  private buildSystemPromptWithTools(): string {
    const basePrompt = this.agent?.systemPrompt || '';

    const toolInstructions = `

**Available Tools:**
You have access to tools that let you query real data from the workspace. Use these tools to get accurate, up-to-date information instead of guessing.

- find_issues: Search and filter issues by any criteria (text, project, type, status, priority, assignee, etc.)
- get_workload: Get workload information for team members with issue counts and status breakdown
- get_workspace_stats: Get overall workspace statistics (total issues, projects, members, health score)
- get_project_info: Get detailed information about a specific project
- search_users: Search for workspace members by name or email
- get_issue_details: Get full details about a specific issue by its key
- get_recent_activity: Get recent activity in the workspace

**When to use tools:**
- User asks about specific data (workload, issues, projects, team members)
- User wants to search or find issues
- User asks for summaries, reports, or statistics
- User asks "who", "what", "how many", "which" questions about workspace data

**Important:** Always use tools for data questions. Don't guess or make up data. If a tool call fails, explain what happened and suggest alternatives.`;

    return basePrompt + toolInstructions;
  }

  /**
   * Generate a non-streaming response.
   */
  private async generateResponse(
    userMessage: string,
    context: AIContext,
    conversationHistory: AIMessage[]
  ): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    const systemPrompt = this.agent?.systemPrompt || '';
    const contextPrompt = this.buildContextPrompt(context);
    const fullPrompt = `${contextPrompt}\n\nUser message: ${userMessage}`;

    if (this.config.provider === 'anthropic' && this.anthropic) {
      return this.generateAnthropicResponse(systemPrompt, fullPrompt, conversationHistory);
    } else if (this.config.provider === 'openai' && this.openai) {
      return this.generateOpenAIResponse(systemPrompt, fullPrompt, conversationHistory);
    }

    throw new Error('No AI provider configured');
  }

  private buildAnthropicMessages(
    history: AIMessage[],
    currentPrompt: string
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages = history.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    if (messages.length > 0) {
      messages[messages.length - 1] = { role: 'user', content: currentPrompt };
    } else {
      messages.push({ role: 'user', content: currentPrompt });
    }

    return messages;
  }

  private buildOpenAIMessages(
    systemPrompt: string,
    history: AIMessage[],
    currentPrompt: string
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    if (messages.length > 1) {
      messages[messages.length - 1] = { role: 'user', content: currentPrompt };
    } else {
      messages.push({ role: 'user', content: currentPrompt });
    }

    return messages;
  }

  private async generateAnthropicResponse(
    systemPrompt: string,
    prompt: string,
    conversationHistory: AIMessage[]
  ): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const messages = this.buildAnthropicMessages(conversationHistory, prompt);

    const response = await this.anthropic.messages.create({
      model: this.config.model || 'claude-sonnet-4-6',
      max_tokens: this.config.maxTokens || 2048,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const { action, suggestions, cleanContent } = this.parseResponse(content);

    return { content: cleanContent, action, suggestions };
  }

  private async generateOpenAIResponse(
    systemPrompt: string,
    prompt: string,
    conversationHistory: AIMessage[]
  ): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const messages = this.buildOpenAIMessages(systemPrompt, conversationHistory, prompt);

    const response = await this.openai.chat.completions.create({
      model: this.config.model || 'gpt-4-turbo-preview',
      max_tokens: this.config.maxTokens || 2048,
      temperature: this.config.temperature || 0.7,
      messages,
    });

    const content = response.choices[0]?.message?.content || '';
    const { action, suggestions, cleanContent } = this.parseResponse(content);

    return { content: cleanContent, action, suggestions };
  }

  /**
   * Build context prompt from user context (simplified - AI uses tools for data)
   */
  private buildContextPrompt(context: AIContext): string {
    const parts: string[] = ['**Current Context:**'];

    parts.push(`- User: ${context.user.name} (${context.user.email})`);
    parts.push(`- Workspace: ${context.workspace.name} (ID: ${context.workspace.id})`);

    if (context.currentPage) {
      parts.push(`- Current Page: ${context.currentPage.type}${context.currentPage.name ? ` - ${context.currentPage.name}` : ''}`);

      // Include basic overview stats if available
      if (context.currentPage.data?.overview) {
        const overview = context.currentPage.data.overview as any;
        parts.push(`- Workspace has: ${overview.projectCount || 0} projects, ${overview.issueCount || 0} issues, ${overview.memberCount || 0} members`);
      }
    }

    if (context.selection?.issues?.length) {
      parts.push(`- Selected Issues: ${context.selection.issues.join(', ')}`);
    }

    parts.push('\nUse your tools to query detailed data about issues, workload, projects, etc.');

    return parts.join('\n');
  }

  /**
   * Parse AI response for actions and suggestions
   */
  private parseResponse(content: string): {
    cleanContent: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  } {
    let cleanContent = content;
    let action: AIAction | undefined;
    const suggestions: AISuggestion[] = [];

    // Parse actions from response
    const actionRegex = /\[ACTION:\s*type="([^"]+)"\s*params=(\{[^}]+\})\]/g;
    let match;

    while ((match = actionRegex.exec(content)) !== null) {
      try {
        action = {
          type: match[1] as AIAction['type'],
          params: JSON.parse(match[2]),
          status: 'pending',
        };
        cleanContent = cleanContent.replace(match[0], '').trim();
      } catch (e) {
        console.error('Failed to parse action:', e);
      }
    }

    // Parse suggestions from response
    const suggestionRegex = /\[SUGGESTION:\s*title="([^"]+)"\s*description="([^"]+)"(?:\s*action="([^"]+)")?\]/g;

    while ((match = suggestionRegex.exec(content)) !== null) {
      suggestions.push({
        id: this.generateId(),
        type: 'quick_action',
        title: match[1],
        description: match[2],
      });
      cleanContent = cleanContent.replace(match[0], '').trim();
    }

    return { cleanContent, action, suggestions };
  }

  /**
   * Get quick suggestions based on context and current agent
   */
  async getQuickSuggestions(context: AIContext): Promise<AISuggestion[]> {
    const suggestions: AISuggestion[] = [];
    const isNova = this.agent?.slug === 'nova';

    if (context.currentPage?.type === 'dashboard') {
      if (isNova) {
        suggestions.push(
          {
            id: this.generateId(),
            type: 'quick_action',
            title: 'Sprint report',
            description: 'Generate a sprint progress report',
          },
          {
            id: this.generateId(),
            type: 'quick_action',
            title: 'Balance workload',
            description: 'Analyze and balance team workload',
          }
        );
      } else {
        suggestions.push(
          {
            id: this.generateId(),
            type: 'quick_action',
            title: 'What needs my attention?',
            description: 'Show overdue and high-priority items',
          },
          {
            id: this.generateId(),
            type: 'quick_action',
            title: 'Summarize team progress',
            description: 'Get a summary of recent team activity',
          }
        );
      }
    } else if (context.currentPage?.type === 'view') {
      suggestions.push(
        {
          id: this.generateId(),
          type: 'quick_action',
          title: isNova ? 'Triage these issues' : 'Summarize this view',
          description: isNova
            ? 'Auto-categorize and prioritize issues'
            : 'Generate an AI summary of issues in this view',
        },
        {
          id: this.generateId(),
          type: 'quick_action',
          title: 'Find blockers',
          description: 'Identify blocked or at-risk items',
        }
      );
    } else if (context.currentPage?.type === 'issue') {
      suggestions.push(
        {
          id: this.generateId(),
          type: 'quick_action',
          title: 'Find related issues',
          description: 'Search for similar or related issues',
        },
        {
          id: this.generateId(),
          type: 'quick_action',
          title: isNova ? 'Update this issue' : 'Suggest acceptance criteria',
          description: isNova
            ? 'Modify priority, assignee, or status'
            : 'Generate acceptance criteria based on description',
        }
      );
    }

    // Common actions
    if (isNova) {
      suggestions.push({
        id: this.generateId(),
        type: 'quick_action',
        title: 'Create an issue',
        description: 'Create a new task, bug, or story',
      });
    } else {
      suggestions.push({
        id: this.generateId(),
        type: 'quick_action',
        title: 'Search issues',
        description: 'Find issues by keyword or criteria',
      });
    }

    return suggestions.slice(0, 6);
  }

  /**
   * Generate AI insights for dashboard
   */
  async generateDashboardInsights(
    context: AIContext,
    data: {
      overdueCount: number;
      atRiskCount: number;
      blockedCount: number;
      completedThisWeek: number;
      openIssues: number;
    }
  ): Promise<AISuggestion[]> {
    const insights: AISuggestion[] = [];

    if (data.overdueCount > 0) {
      insights.push({
        id: this.generateId(),
        type: 'insight',
        title: `${data.overdueCount} overdue items need attention`,
        description: 'These items have passed their due date and should be prioritized.',
        priority: 'high',
        action: {
          type: 'navigate',
          params: { path: 'overdue-issues' },
          status: 'pending',
        },
      });
    }

    if (data.blockedCount > 0) {
      insights.push({
        id: this.generateId(),
        type: 'insight',
        title: `${data.blockedCount} blocked items`,
        description: 'Some team members may need help unblocking their work.',
        priority: 'high',
        action: {
          type: 'search',
          params: { status: 'blocked' },
          status: 'pending',
        },
      });
    }

    if (data.atRiskCount > 3) {
      insights.push({
        id: this.generateId(),
        type: 'insight',
        title: 'Several items are at risk',
        description: `${data.atRiskCount} items are due soon and may need attention.`,
        priority: 'medium',
      });
    }

    if (data.completedThisWeek > 0) {
      insights.push({
        id: this.generateId(),
        type: 'insight',
        title: `Great progress! ${data.completedThisWeek} items completed`,
        description: 'Your team has been productive this week.',
        priority: 'low',
      });
    }

    return insights;
  }

  /**
   * Get the current agent definition
   */
  getAgent(): AgentDefinition | null {
    return this.agent;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Factory function - creates per-request instances (no singleton)
export function createAssistant(config?: AIAssistantConfig): AgentAssistant {
  return new AgentAssistant(config);
}

// Backward compatibility - singleton for simple usage
let defaultInstance: AgentAssistant | null = null;

/** @deprecated Use createAssistant() for new code */
export function getAIAssistant(config?: AIAssistantConfig): AgentAssistant {
  if (!defaultInstance) {
    defaultInstance = new AgentAssistant(config);
  }
  return defaultInstance;
}

/** @deprecated Use createAssistant() for new code */
export function resetAIAssistant() {
  defaultInstance = null;
}

// Re-export old class name for compatibility
export { AgentAssistant as AIAssistant };
