/**
 * Spec and Test Case Generator
 *
 * AI-powered service that generates technical specifications,
 * acceptance criteria, and test cases from issue descriptions.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import { getAgentRegistry } from '../agents/agent-registry';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface IssueInput {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  type: string;
  priority?: string;
  labels?: string[];
  parentIssue?: {
    id: string;
    title: string;
    description?: string;
  };
  relatedIssues?: Array<{
    id: string;
    title: string;
    type: string;
  }>;
  comments?: Array<{
    author: string;
    content: string;
    createdAt: Date;
  }>;
}

export interface ProjectContext {
  name: string;
  description?: string;
  techStack?: string[];
  existingFeatures?: string[];
  codingStandards?: string;
  testingFramework?: string;
}

export interface TechnicalSpec {
  issueId: string;
  issueTitle: string;
  generatedAt: Date;

  summary: string;
  scope: {
    included: string[];
    excluded: string[];
    assumptions: string[];
  };

  functionalRequirements: Requirement[];
  nonFunctionalRequirements: Requirement[];

  technicalApproach: {
    overview: string;
    components: ComponentSpec[];
    dataModels?: DataModelSpec[];
    apiChanges?: APIChangeSpec[];
    dependencies?: string[];
  };

  acceptanceCriteria: AcceptanceCriterion[];
  edgeCases: EdgeCase[];

  estimatedEffort?: EffortEstimate;
  risks?: Risk[];

  agentName: string;
}

export interface Requirement {
  id: string;
  description: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  rationale?: string;
}

export interface ComponentSpec {
  name: string;
  type: 'new' | 'modified' | 'existing';
  description: string;
  responsibilities: string[];
  interfaces?: string[];
}

export interface DataModelSpec {
  name: string;
  type: 'new' | 'modified';
  fields: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

export interface APIChangeSpec {
  endpoint: string;
  method: string;
  type: 'new' | 'modified' | 'deprecated';
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

export interface AcceptanceCriterion {
  id: string;
  scenario: string;
  given: string;
  when: string;
  then: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface EdgeCase {
  id: string;
  scenario: string;
  expectedBehavior: string;
  testApproach: string;
}

export interface EffortEstimate {
  storyPoints?: number;
  hours?: number;
  complexity: 'low' | 'medium' | 'high' | 'very_high';
  breakdown?: Array<{
    task: string;
    effort: string;
  }>;
}

export interface Risk {
  id: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface TestSuite {
  issueId: string;
  issueTitle: string;
  generatedAt: Date;

  overview: string;
  testStrategy: string;

  unitTests: TestCase[];
  integrationTests: TestCase[];
  e2eTests: TestCase[];

  testData?: TestDataSpec[];
  mocks?: MockSpec[];

  coverageTargets?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };

  agentName: string;
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority: 'critical' | 'high' | 'medium' | 'low';

  preconditions?: string[];
  steps: TestStep[];
  expectedResult: string;
  cleanupSteps?: string[];

  tags?: string[];
  automatable: boolean;
  codeSnippet?: string;
}

export interface TestStep {
  order: number;
  action: string;
  data?: string;
  expectedOutcome?: string;
}

export interface TestDataSpec {
  name: string;
  description: string;
  structure: string;
  examples: string[];
}

export interface MockSpec {
  name: string;
  type: 'api' | 'database' | 'service' | 'external';
  description: string;
  behavior: string;
}

export interface SpecGeneratorOptions {
  model?: AIModelId;
  specDetail?: 'minimal' | 'standard' | 'detailed';
  testDetail?: 'minimal' | 'standard' | 'comprehensive';
  includeCodeSnippets?: boolean;
  targetFramework?: string;
  targetLanguage?: string;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<SpecGeneratorOptions> = {
  model: 'gpt-4o',
  specDetail: 'standard',
  testDetail: 'standard',
  includeCodeSnippets: true,
  targetFramework: 'jest',
  targetLanguage: 'typescript',
};

// ============================================================================
// Spec Generator Service
// ============================================================================

export class SpecGenerator {
  private options: Required<SpecGeneratorOptions>;

  constructor(options: SpecGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a technical specification for an issue
   */
  async generateSpec(
    issue: IssueInput,
    projectContext?: ProjectContext
  ): Promise<TechnicalSpec> {
    const orchestrator = getAIOrchestrator();
    const registry = getAgentRegistry();

    // Use Sage (planner) agent for spec generation
    const agent = registry.getAgent('sage') || registry.getAgent('default-sage');
    const systemPrompt = agent?.systemPrompt || this.getSpecSystemPrompt();

    const prompt = this.buildSpecPrompt(issue, projectContext);

    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      model: this.options.model,
      maxTokens: 4000,
      temperature: 0.3,
    });

    return this.parseSpecResponse(response.content, issue, agent?.name || 'Sage');
  }

  /**
   * Generate test cases for an issue
   */
  async generateTests(
    issue: IssueInput,
    spec?: TechnicalSpec,
    projectContext?: ProjectContext
  ): Promise<TestSuite> {
    const orchestrator = getAIOrchestrator();
    const registry = getAgentRegistry();

    // Use Rex (reviewer) agent for test generation
    const agent = registry.getAgent('rex') || registry.getAgent('default-rex');
    const systemPrompt = agent?.systemPrompt || this.getTestSystemPrompt();

    const prompt = this.buildTestPrompt(issue, spec, projectContext);

    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      model: this.options.model,
      maxTokens: 4000,
      temperature: 0.3,
    });

    return this.parseTestResponse(response.content, issue, agent?.name || 'Rex');
  }

  /**
   * Generate acceptance criteria only
   */
  async generateAcceptanceCriteria(issue: IssueInput): Promise<AcceptanceCriterion[]> {
    const orchestrator = getAIOrchestrator();

    const prompt = `Generate acceptance criteria for this issue using Gherkin format (Given/When/Then):

**Issue:** ${issue.identifier}: ${issue.title}
**Type:** ${issue.type}
**Description:** ${issue.description || 'No description provided'}

Please provide 3-7 acceptance criteria covering:
1. Happy path scenarios
2. Error handling
3. Edge cases
4. User experience requirements

Format each criterion as:
- Scenario: [brief description]
- Given: [precondition]
- When: [action]
- Then: [expected result]
- Priority: critical|high|medium|low`;

    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-haiku-3.5',
      maxTokens: 1500,
    });

    return this.parseAcceptanceCriteria(response.content);
  }

  /**
   * Quick estimation for an issue
   */
  async estimateEffort(
    issue: IssueInput,
    projectContext?: ProjectContext
  ): Promise<EffortEstimate> {
    const orchestrator = getAIOrchestrator();

    const prompt = `Estimate the effort for this issue:

**Issue:** ${issue.identifier}: ${issue.title}
**Type:** ${issue.type}
**Description:** ${issue.description || 'No description provided'}
${projectContext?.techStack ? `**Tech Stack:** ${projectContext.techStack.join(', ')}` : ''}

Provide:
1. Story points (1, 2, 3, 5, 8, 13, or 21)
2. Estimated hours
3. Complexity (low, medium, high, very_high)
4. Task breakdown with individual estimates

Consider:
- Development time
- Testing time
- Code review time
- Documentation
- Potential blockers`;

    const response = await orchestrator.complete({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-haiku-3.5',
      maxTokens: 800,
    });

    return this.parseEffortEstimate(response.content);
  }

  // ============================================================================
  // Private Methods - System Prompts
  // ============================================================================

  private getSpecSystemPrompt(): string {
    return `You are Sage, a technical architect AI specializing in creating comprehensive technical specifications.

Your specifications should:
1. Be clear and unambiguous
2. Cover functional and non-functional requirements
3. Identify potential risks and edge cases
4. Provide a clear technical approach
5. Include testable acceptance criteria

Use MoSCoW prioritization (Must, Should, Could, Won't) for requirements.
Use Gherkin format (Given/When/Then) for acceptance criteria.

Tailor the detail level based on the request:
- Minimal: Key requirements and acceptance criteria only
- Standard: Full spec with technical approach
- Detailed: Comprehensive spec with data models, APIs, and estimates`;
  }

  private getTestSystemPrompt(): string {
    return `You are Rex, a QA engineer AI specializing in creating comprehensive test cases.

Your test suites should:
1. Cover happy paths and edge cases
2. Include unit, integration, and e2e tests
3. Be specific and actionable
4. Include test data specifications
5. Identify what can be automated

Prioritize tests based on risk and impact:
- Critical: Core functionality, security
- High: Important features, common paths
- Medium: Edge cases, minor features
- Low: Nice-to-have coverage

Provide code snippets when requested, using the specified framework.`;
  }

  // ============================================================================
  // Private Methods - Prompt Building
  // ============================================================================

  private buildSpecPrompt(issue: IssueInput, context?: ProjectContext): string {
    let prompt = `Generate a technical specification for this issue:\n\n`;

    prompt += `**Issue:** ${issue.identifier}: ${issue.title}\n`;
    prompt += `**Type:** ${issue.type}\n`;
    if (issue.priority) prompt += `**Priority:** ${issue.priority}\n`;
    prompt += `**Description:**\n${issue.description || 'No description provided'}\n\n`;

    if (issue.parentIssue) {
      prompt += `**Parent Issue:** ${issue.parentIssue.title}\n`;
      if (issue.parentIssue.description) {
        prompt += `${issue.parentIssue.description.slice(0, 500)}\n`;
      }
      prompt += '\n';
    }

    if (issue.relatedIssues && issue.relatedIssues.length > 0) {
      prompt += `**Related Issues:**\n`;
      for (const related of issue.relatedIssues) {
        prompt += `- ${related.title} (${related.type})\n`;
      }
      prompt += '\n';
    }

    if (issue.comments && issue.comments.length > 0) {
      prompt += `**Discussion Highlights:**\n`;
      for (const comment of issue.comments.slice(0, 5)) {
        prompt += `- ${comment.author}: "${comment.content.slice(0, 200)}"\n`;
      }
      prompt += '\n';
    }

    if (context) {
      prompt += `**Project Context:**\n`;
      prompt += `- Project: ${context.name}\n`;
      if (context.techStack) prompt += `- Tech Stack: ${context.techStack.join(', ')}\n`;
      if (context.testingFramework) prompt += `- Testing: ${context.testingFramework}\n`;
      prompt += '\n';
    }

    prompt += `**Detail Level:** ${this.options.specDetail}\n\n`;

    prompt += `Please generate a comprehensive technical specification including:
1. Summary and scope (included, excluded, assumptions)
2. Functional requirements (prioritized with MoSCoW)
3. Non-functional requirements if applicable
4. Technical approach with component breakdown
5. Acceptance criteria in Gherkin format
6. Edge cases to consider
7. Effort estimate
8. Risks and mitigations`;

    return prompt;
  }

  private buildTestPrompt(
    issue: IssueInput,
    spec?: TechnicalSpec,
    context?: ProjectContext
  ): string {
    let prompt = `Generate test cases for this issue:\n\n`;

    prompt += `**Issue:** ${issue.identifier}: ${issue.title}\n`;
    prompt += `**Type:** ${issue.type}\n`;
    prompt += `**Description:**\n${issue.description || 'No description provided'}\n\n`;

    if (spec) {
      prompt += `**Technical Spec Summary:**\n${spec.summary}\n\n`;

      if (spec.acceptanceCriteria.length > 0) {
        prompt += `**Acceptance Criteria:**\n`;
        for (const ac of spec.acceptanceCriteria) {
          prompt += `- ${ac.scenario}: Given ${ac.given}, When ${ac.when}, Then ${ac.then}\n`;
        }
        prompt += '\n';
      }

      if (spec.edgeCases.length > 0) {
        prompt += `**Edge Cases to Cover:**\n`;
        for (const ec of spec.edgeCases) {
          prompt += `- ${ec.scenario}\n`;
        }
        prompt += '\n';
      }
    }

    if (context) {
      prompt += `**Testing Context:**\n`;
      if (context.testingFramework) prompt += `- Framework: ${context.testingFramework}\n`;
      if (context.techStack) prompt += `- Tech Stack: ${context.techStack.join(', ')}\n`;
      prompt += '\n';
    }

    prompt += `**Test Settings:**\n`;
    prompt += `- Detail Level: ${this.options.testDetail}\n`;
    prompt += `- Target Framework: ${this.options.targetFramework}\n`;
    prompt += `- Target Language: ${this.options.targetLanguage}\n`;
    prompt += `- Include Code Snippets: ${this.options.includeCodeSnippets}\n\n`;

    prompt += `Please generate:
1. Unit tests for individual components/functions
2. Integration tests for component interactions
3. E2E tests for user workflows
4. Test data specifications
5. Mock specifications for external dependencies

For each test case, include:
- Clear name and description
- Preconditions
- Step-by-step instructions
- Expected results
- Priority (critical/high/medium/low)
- Whether it's automatable`;

    if (this.options.includeCodeSnippets) {
      prompt += `\n\nInclude ${this.options.targetLanguage} code snippets using ${this.options.targetFramework}.`;
    }

    return prompt;
  }

  // ============================================================================
  // Private Methods - Response Parsing
  // ============================================================================

  private parseSpecResponse(
    content: string,
    issue: IssueInput,
    agentName: string
  ): TechnicalSpec {
    // Extract summary
    const summaryMatch = content.match(/(?:summary|overview)[:\s]*\n?([\s\S]*?)(?=\n##|\n\*\*|$)/i);
    const summary = summaryMatch ? summaryMatch[1].trim().split('\n')[0] : issue.title;

    // Extract requirements
    const functionalReqs = this.extractRequirements(content, 'functional');
    const nonFunctionalReqs = this.extractRequirements(content, 'non-functional');

    // Extract acceptance criteria
    const acceptanceCriteria = this.parseAcceptanceCriteria(content);

    // Extract edge cases
    const edgeCases = this.extractEdgeCases(content);

    // Extract effort estimate
    const effortMatch = content.match(/(?:effort|estimate|story points)[:\s]*(\d+)/i);
    const complexityMatch = content.match(/complexity[:\s]*(low|medium|high|very.?high)/i);

    return {
      issueId: issue.id,
      issueTitle: issue.title,
      generatedAt: new Date(),
      summary,
      scope: {
        included: this.extractListItems(content, 'included|in scope'),
        excluded: this.extractListItems(content, 'excluded|out of scope'),
        assumptions: this.extractListItems(content, 'assumptions'),
      },
      functionalRequirements: functionalReqs,
      nonFunctionalRequirements: nonFunctionalReqs,
      technicalApproach: {
        overview: this.extractSection(content, 'technical approach|implementation'),
        components: this.extractComponents(content),
      },
      acceptanceCriteria,
      edgeCases,
      estimatedEffort: {
        storyPoints: effortMatch ? parseInt(effortMatch[1]) : undefined,
        complexity: complexityMatch
          ? (complexityMatch[1].replace(/\s/g, '_') as EffortEstimate['complexity'])
          : 'medium',
      },
      risks: this.extractRisks(content),
      agentName,
    };
  }

  private parseTestResponse(
    content: string,
    issue: IssueInput,
    agentName: string
  ): TestSuite {
    return {
      issueId: issue.id,
      issueTitle: issue.title,
      generatedAt: new Date(),
      overview: this.extractSection(content, 'overview|test strategy'),
      testStrategy: this.extractSection(content, 'strategy|approach'),
      unitTests: this.extractTestCases(content, 'unit'),
      integrationTests: this.extractTestCases(content, 'integration'),
      e2eTests: this.extractTestCases(content, 'e2e|end-to-end'),
      testData: this.extractTestData(content),
      mocks: this.extractMocks(content),
      agentName,
    };
  }

  private parseAcceptanceCriteria(content: string): AcceptanceCriterion[] {
    const criteria: AcceptanceCriterion[] = [];
    const acSection = content.match(/acceptance criteria[\s\S]*?(?=##|$)/i);

    if (acSection) {
      const scenarioBlocks = acSection[0].split(/(?=scenario:|given:)/i);

      for (const block of scenarioBlocks) {
        const scenarioMatch = block.match(/scenario[:\s]*(.+?)(?=\n|given)/i);
        const givenMatch = block.match(/given[:\s]*(.+?)(?=\n|when)/i);
        const whenMatch = block.match(/when[:\s]*(.+?)(?=\n|then)/i);
        const thenMatch = block.match(/then[:\s]*(.+?)(?=\n|priority|$)/i);
        const priorityMatch = block.match(/priority[:\s]*(critical|high|medium|low)/i);

        if (givenMatch && whenMatch && thenMatch) {
          criteria.push({
            id: `ac-${criteria.length + 1}`,
            scenario: scenarioMatch ? scenarioMatch[1].trim() : `Criterion ${criteria.length + 1}`,
            given: givenMatch[1].trim(),
            when: whenMatch[1].trim(),
            then: thenMatch[1].trim(),
            priority: (priorityMatch?.[1] as AcceptanceCriterion['priority']) || 'medium',
          });
        }
      }
    }

    return criteria;
  }

  private parseEffortEstimate(content: string): EffortEstimate {
    const pointsMatch = content.match(/story points?[:\s]*(\d+)/i);
    const hoursMatch = content.match(/hours?[:\s]*(\d+)/i);
    const complexityMatch = content.match(/complexity[:\s]*(low|medium|high|very.?high)/i);

    return {
      storyPoints: pointsMatch ? parseInt(pointsMatch[1]) : undefined,
      hours: hoursMatch ? parseInt(hoursMatch[1]) : undefined,
      complexity: complexityMatch
        ? (complexityMatch[1].replace(/\s/g, '_') as EffortEstimate['complexity'])
        : 'medium',
    };
  }

  private extractRequirements(content: string, type: string): Requirement[] {
    const reqs: Requirement[] = [];
    const section = content.match(new RegExp(`${type}[\\s\\S]*?(?=##|non-functional|$)`, 'i'));

    if (section) {
      const lines = section[0].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s*(?:\[(must|should|could|won'?t)\])?\s*(.+)/i);
        if (match) {
          reqs.push({
            id: `req-${reqs.length + 1}`,
            description: match[2].trim(),
            priority: (match[1]?.toLowerCase() as Requirement['priority']) || 'should',
          });
        }
      }
    }

    return reqs;
  }

  private extractListItems(content: string, pattern: string): string[] {
    const items: string[] = [];
    const section = content.match(new RegExp(`${pattern}[\\s\\S]*?(?=\\n##|\\n\\*\\*|$)`, 'i'));

    if (section) {
      const lines = section[0].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s+(.+)/);
        if (match) items.push(match[1].trim());
      }
    }

    return items;
  }

  private extractSection(content: string, pattern: string): string {
    const match = content.match(new RegExp(`${pattern}[:\\s]*\\n?([\\s\\S]*?)(?=\\n##|\\n\\*\\*|$)`, 'i'));
    return match ? match[1].trim().split('\n').slice(0, 3).join(' ') : '';
  }

  private extractComponents(content: string): ComponentSpec[] {
    const components: ComponentSpec[] = [];
    const section = content.match(/components?[\s\S]*?(?=##|$)/i);

    if (section) {
      const compMatches = section[0].matchAll(/[-*]\s*\*?\*?([^:*]+)\*?\*?[:\s]+(.+)/g);
      for (const match of compMatches) {
        components.push({
          name: match[1].trim(),
          type: 'new',
          description: match[2].trim(),
          responsibilities: [],
        });
      }
    }

    return components;
  }

  private extractEdgeCases(content: string): EdgeCase[] {
    const cases: EdgeCase[] = [];
    const section = content.match(/edge cases?[\s\S]*?(?=##|$)/i);

    if (section) {
      const lines = section[0].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s+(.+)/);
        if (match) {
          cases.push({
            id: `ec-${cases.length + 1}`,
            scenario: match[1].trim(),
            expectedBehavior: '',
            testApproach: '',
          });
        }
      }
    }

    return cases;
  }

  private extractRisks(content: string): Risk[] {
    const risks: Risk[] = [];
    const section = content.match(/risks?[\s\S]*?(?=##|$)/i);

    if (section) {
      const lines = section[0].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s+(.+)/);
        if (match) {
          risks.push({
            id: `risk-${risks.length + 1}`,
            description: match[1].trim(),
            likelihood: 'medium',
            impact: 'medium',
            mitigation: '',
          });
        }
      }
    }

    return risks;
  }

  private extractTestCases(content: string, type: string): TestCase[] {
    const tests: TestCase[] = [];
    const section = content.match(new RegExp(`${type}[\\s\\S]*?(?=##|integration|e2e|end-to-end|$)`, 'i'));

    if (section) {
      // Look for test case patterns
      const testMatches = section[0].matchAll(/(?:test|it|describe)[:\s]*["']?([^"'\n]+)["']?/gi);
      for (const match of testMatches) {
        tests.push({
          id: `test-${tests.length + 1}`,
          name: match[1].trim(),
          description: match[1].trim(),
          type: type.includes('unit') ? 'unit' : type.includes('e2e') ? 'e2e' : 'integration',
          priority: 'medium',
          steps: [{ order: 1, action: 'Execute test', expectedOutcome: 'Test passes' }],
          expectedResult: 'Test passes successfully',
          automatable: true,
        });
      }
    }

    return tests;
  }

  private extractTestData(content: string): TestDataSpec[] {
    const data: TestDataSpec[] = [];
    const section = content.match(/test data[\s\S]*?(?=##|$)/i);

    if (section) {
      const items = section[0].matchAll(/[-*]\s*\*?\*?([^:*]+)\*?\*?[:\s]+(.+)/g);
      for (const match of items) {
        data.push({
          name: match[1].trim(),
          description: match[2].trim(),
          structure: '',
          examples: [],
        });
      }
    }

    return data;
  }

  private extractMocks(content: string): MockSpec[] {
    const mocks: MockSpec[] = [];
    const section = content.match(/mocks?[\s\S]*?(?=##|$)/i);

    if (section) {
      const items = section[0].matchAll(/[-*]\s*\*?\*?([^:*]+)\*?\*?[:\s]+(.+)/g);
      for (const match of items) {
        mocks.push({
          name: match[1].trim(),
          type: 'service',
          description: match[2].trim(),
          behavior: '',
        });
      }
    }

    return mocks;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let specGeneratorInstance: SpecGenerator | null = null;

export function getSpecGenerator(options?: SpecGeneratorOptions): SpecGenerator {
  if (!specGeneratorInstance) {
    specGeneratorInstance = new SpecGenerator(options);
  }
  return specGeneratorInstance;
}
