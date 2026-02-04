import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Types for AI Assistant
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    action?: AIAction;
    suggestions?: AISuggestion[];
    context?: AIContext;
  };
}

export interface AIAction {
  type: 'create_issue' | 'update_issue' | 'search' | 'navigate' | 'summarize' | 'analyze' | 'suggest';
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

// System prompt for the AI Assistant
const ASSISTANT_SYSTEM_PROMPT = `You are an AI assistant integrated into Collab, a project management platform for software development teams. You help users manage issues, projects, and views efficiently.

**Your Capabilities:**
- Create, update, and search issues (tasks, bugs, stories, epics)
- Navigate users to relevant pages
- Summarize project status and team activity
- Provide insights and recommendations
- Answer questions about the platform and project management best practices

**Response Guidelines:**
1. Be concise and actionable
2. When suggesting actions, use the structured action format
3. Reference specific issues by their keys (e.g., MA-123)
4. Provide context-aware suggestions based on the user's current page
5. Use professional but friendly tone
6. When creating issues, ask for missing required information

**Action Format:**
When you need to perform an action, include it in your response using this format:
[ACTION: type="action_type" params={...}]

Available actions:
- create_issue: Create a new issue
- update_issue: Update an existing issue
- search: Search for issues/projects
- navigate: Navigate to a specific page
- summarize: Generate a summary
- analyze: Analyze data and provide insights

**Current Context:**
The user's context will be provided with each message, including their current page, workspace, and recent activity.

Always prioritize helping users be productive and efficient in their project management tasks.`;

export class AIAssistant {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private config: AIAssistantConfig;
  private conversationHistory: AIMessage[] = [];

  constructor(config: AIAssistantConfig = { provider: 'anthropic' }) {
    this.config = {
      provider: config.provider || 'anthropic',
      model: config.model || (config.provider === 'openai' ? 'gpt-4-turbo-preview' : 'claude-sonnet-4-20250514'),
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
   * Send a message to the AI assistant
   */
  async chat(
    userMessage: string,
    context: AIContext,
    options?: { streaming?: boolean }
  ): Promise<AIMessage> {
    const messageId = this.generateId();
    const userMsg: AIMessage = {
      id: messageId,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      metadata: { context },
    };

    this.conversationHistory.push(userMsg);

    try {
      const response = await this.generateResponse(userMessage, context);

      const assistantMsg: AIMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: {
          action: response.action,
          suggestions: response.suggestions,
        },
      };

      this.conversationHistory.push(assistantMsg);
      return assistantMsg;
    } catch (error) {
      console.error('AI Assistant error:', error);

      const errorMsg: AIMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };

      this.conversationHistory.push(errorMsg);
      return errorMsg;
    }
  }

  /**
   * Generate a response using the configured AI provider
   */
  private async generateResponse(
    userMessage: string,
    context: AIContext
  ): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    const contextPrompt = this.buildContextPrompt(context);
    const fullPrompt = `${contextPrompt}\n\nUser message: ${userMessage}`;

    if (this.config.provider === 'anthropic' && this.anthropic) {
      return this.generateAnthropicResponse(fullPrompt);
    } else if (this.config.provider === 'openai' && this.openai) {
      return this.generateOpenAIResponse(fullPrompt);
    }

    throw new Error('No AI provider configured');
  }

  /**
   * Generate response using Anthropic Claude
   */
  private async generateAnthropicResponse(prompt: string): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    const messages = this.conversationHistory.slice(-10).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Replace the last message with our full prompt
    if (messages.length > 0) {
      messages[messages.length - 1] = { role: 'user', content: prompt };
    }

    const response = await this.anthropic.messages.create({
      model: this.config.model || 'claude-sonnet-4-20250514',
      max_tokens: this.config.maxTokens || 2048,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: messages.length > 0 ? messages : [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const { action, suggestions, cleanContent } = this.parseResponse(content);

    return {
      content: cleanContent,
      action,
      suggestions,
    };
  }

  /**
   * Generate response using OpenAI
   */
  private async generateOpenAIResponse(prompt: string): Promise<{
    content: string;
    action?: AIAction;
    suggestions?: AISuggestion[];
  }> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...this.conversationHistory.slice(-10).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Replace the last message with our full prompt
    if (messages.length > 1) {
      messages[messages.length - 1] = { role: 'user', content: prompt };
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.model || 'gpt-4-turbo-preview',
      max_tokens: this.config.maxTokens || 2048,
      temperature: this.config.temperature || 0.7,
      messages,
    });

    const content = response.choices[0]?.message?.content || '';
    const { action, suggestions, cleanContent } = this.parseResponse(content);

    return {
      content: cleanContent,
      action,
      suggestions,
    };
  }

  /**
   * Build context prompt from user context
   */
  private buildContextPrompt(context: AIContext): string {
    const parts: string[] = ['**Current Context:**'];

    parts.push(`- User: ${context.user.name} (${context.user.email})`);
    parts.push(`- Workspace: ${context.workspace.name}`);

    if (context.currentPage) {
      parts.push(`- Current Page: ${context.currentPage.type}${context.currentPage.name ? ` - ${context.currentPage.name}` : ''}`);
      if (context.currentPage.data) {
        parts.push(`- Page Data: ${JSON.stringify(context.currentPage.data)}`);
      }
    }

    if (context.selection?.issues?.length) {
      parts.push(`- Selected Issues: ${context.selection.issues.join(', ')}`);
    }

    if (context.recentActivity) {
      if (context.recentActivity.issues.length) {
        const recentIssues = context.recentActivity.issues.slice(0, 5);
        parts.push(`- Recent Issues: ${recentIssues.map(i => `${i.key}: ${i.title}`).join('; ')}`);
      }
    }

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
   * Get quick suggestions based on context
   */
  async getQuickSuggestions(context: AIContext): Promise<AISuggestion[]> {
    const suggestions: AISuggestion[] = [];

    // Add context-aware quick actions
    if (context.currentPage?.type === 'dashboard') {
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
    } else if (context.currentPage?.type === 'view') {
      suggestions.push(
        {
          id: this.generateId(),
          type: 'quick_action',
          title: 'Summarize this view',
          description: 'Generate an AI summary of issues in this view',
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
          title: 'Suggest acceptance criteria',
          description: 'Generate acceptance criteria based on description',
        }
      );
    }

    // Add common quick actions
    suggestions.push(
      {
        id: this.generateId(),
        type: 'quick_action',
        title: 'Create an issue',
        description: 'Create a new task, bug, or story',
      },
      {
        id: this.generateId(),
        type: 'quick_action',
        title: 'Search issues',
        description: 'Find issues by keyword or criteria',
      }
    );

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
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory(): AIMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
let assistantInstance: AIAssistant | null = null;

export function getAIAssistant(config?: AIAssistantConfig): AIAssistant {
  if (!assistantInstance) {
    assistantInstance = new AIAssistant(config);
  }
  return assistantInstance;
}

export function resetAIAssistant() {
  assistantInstance = null;
}
