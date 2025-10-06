import OpenAI from 'openai';
import { IssueType } from '@prisma/client';

interface IssueData {
  title: string;
  description?: string;
  type: IssueType;
  issueKey?: string;
}

export class AIContentGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAPI_KEY,
    });
  }

  /**
   * Enhance issue title for better changelog presentation
   */
  async enhanceIssueTitle(title: string, description?: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a technical writer creating clear, concise issue titles for software release notes. 
            Transform titles into user-friendly, action-oriented descriptions that clearly explain what was accomplished.
            Keep titles under 80 characters and use active voice.`
          },
          {
            role: 'user',
            content: `
            Original title: "${title}"
            ${description ? `Description: "${description.slice(0, 300)}"` : ''}
            
            Create an improved, user-friendly title for this issue that would be clear in a changelog.
            `
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      return response.choices[0]?.message?.content?.trim() || title;
    } catch (error) {
      console.error('Error enhancing issue title:', error);
      return title; // Fallback to original title
    }
  }

  /**
   * Generate comprehensive summary for an issue
   */
  async generateIssueSummary(title: string, description?: string, type?: IssueType): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a technical writer creating clear summaries for software release notes.
            Generate concise, user-focused summaries that explain the impact and benefit of changes.
            Focus on what users will experience, not technical implementation details.
            Keep summaries under 150 words.`
          },
          {
            role: 'user',
            content: `
            Type: ${type || 'TASK'}
            Title: "${title}"
            ${description ? `Description: "${description.slice(0, 500)}"` : ''}
            
            Create a user-friendly summary explaining what this ${type?.toLowerCase() || 'change'} accomplishes and its benefits.
            `
          }
        ],
        temperature: 0.4,
        max_tokens: 200,
      });

      return response.choices[0]?.message?.content?.trim() || 
        `${this.getTypeDescription(type)} related to ${title}`;
    } catch (error) {
      console.error('Error generating issue summary:', error);
      return `${this.getTypeDescription(type)} related to ${title}`;
    }
  }

  /**
   * Generate comprehensive changelog for a version
   */
  async generateVersionChangelog(issues: IssueData[]): Promise<string> {
    try {
      const categorizedIssues = this.categorizeIssues(issues);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a technical writer creating professional software release notes.
            Generate comprehensive, well-structured changelog content that follows these guidelines:
            
            1. Use clear categories (🎉 New Features, 🐛 Bug Fixes, ⚡ Improvements, etc.)
            2. Write in past tense, active voice
            3. Focus on user benefits and impact
            4. Use bullet points for easy scanning
            5. Include relevant technical details when helpful
            6. Maintain professional, positive tone
            
            Format as markdown with appropriate headers and emoji icons.`
          },
          {
            role: 'user',
            content: `
            Generate a changelog for this release with the following changes:
            
            ## New Features & Tasks (${categorizedIssues.features.length})
            ${categorizedIssues.features.map(issue => `- ${issue.title}${issue.description ? `: ${issue.description.slice(0, 100)}...` : ''}`).join('\n')}
            
            ## Bug Fixes (${categorizedIssues.bugfixes.length})
            ${categorizedIssues.bugfixes.map(issue => `- ${issue.title}${issue.description ? `: ${issue.description.slice(0, 100)}...` : ''}`).join('\n')}
            
            ## Improvements & Other (${categorizedIssues.improvements.length})
            ${categorizedIssues.improvements.map(issue => `- ${issue.title}${issue.description ? `: ${issue.description.slice(0, 100)}...` : ''}`).join('\n')}
            
            Create a compelling changelog that highlights the value of this release.
            `
          }
        ],
        temperature: 0.5,
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content?.trim() || this.generateFallbackChangelog(issues);
    } catch (error) {
      console.error('Error generating version changelog:', error);
      return this.generateFallbackChangelog(issues);
    }
  }

  /**
   * Generate version summary for release notes
   */
  async generateVersionSummary(issues: IssueData[]): Promise<string> {
    try {
      const categorizedIssues = this.categorizeIssues(issues);
      const stats = {
        features: categorizedIssues.features.length,
        bugfixes: categorizedIssues.bugfixes.length,
        improvements: categorizedIssues.improvements.length,
        total: issues.length,
      };

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a product manager writing engaging release summaries.
            Create compelling, concise summaries that highlight the key value and improvements in software releases.
            Focus on user benefits and overall impact. Keep it under 200 words and maintain an encouraging tone.`
          },
          {
            role: 'user',
            content: `
            Create a release summary for this version that includes:
            - ${stats.features} new features/tasks
            - ${stats.bugfixes} bug fixes  
            - ${stats.improvements} improvements
            - ${stats.total} total changes
            
            Key features:
            ${categorizedIssues.features.slice(0, 3).map(issue => `- ${issue.title}`).join('\n')}
            
            Major fixes:
            ${categorizedIssues.bugfixes.slice(0, 3).map(issue => `- ${issue.title}`).join('\n')}
            
            Write an engaging summary that would excite users about this release.
            `
          }
        ],
        temperature: 0.6,
        max_tokens: 300,
      });

      return response.choices[0]?.message?.content?.trim() || 
        this.generateFallbackSummary(stats);
    } catch (error) {
      console.error('Error generating version summary:', error);
      const categorizedIssues = this.categorizeIssues(issues);
      return this.generateFallbackSummary({
        features: categorizedIssues.features.length,
        bugfixes: categorizedIssues.bugfixes.length,
        improvements: categorizedIssues.improvements.length,
        total: issues.length,
      });
    }
  }

  /**
   * Generate deployment notes for version.json
   */
  async generateDeploymentNotes(issues: IssueData[], environment: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are generating deployment notes for technical teams.
            Create concise, technical summaries focusing on:
            - Key changes that affect deployment
            - Database migrations or breaking changes
            - Configuration updates needed
            - Rollback considerations
            Keep it under 100 words and technical.`
          },
          {
            role: 'user',
            content: `
            Environment: ${environment}
            Changes: ${issues.length} total
            
            ${issues.map(issue => `- ${issue.type}: ${issue.title}`).join('\n')}
            
            Generate deployment notes for technical teams.
            `
          }
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      return response.choices[0]?.message?.content?.trim() || 
        `Deployment includes ${issues.length} changes. Review individual items for specific impacts.`;
    } catch (error) {
      console.error('Error generating deployment notes:', error);
      return `Deployment includes ${issues.length} changes. Review individual items for specific impacts.`;
    }
  }

  // Helper methods
  private categorizeIssues(issues: IssueData[]) {
    return {
      features: issues.filter(issue => ['TASK', 'STORY', 'EPIC'].includes(issue.type)),
      bugfixes: issues.filter(issue => issue.type === 'BUG'),
      improvements: issues.filter(issue => ['MILESTONE', 'SUBTASK'].includes(issue.type)),
    };
  }

  private getTypeDescription(type?: IssueType): string {
    const descriptions = {
      TASK: 'Feature implementation',
      STORY: 'User story implementation',
      BUG: 'Bug fix',
      EPIC: 'Major feature',
      MILESTONE: 'Milestone achievement',
      SUBTASK: 'Improvement',
    };
    return descriptions[type || 'TASK'] || 'Change';
  }

  private generateFallbackChangelog(issues: IssueData[]): string {
    const categorized = this.categorizeIssues(issues);
    
    let changelog = '## 🎉 New Features & Enhancements\n\n';
    categorized.features.forEach(issue => {
      changelog += `- ${issue.title}\n`;
    });

    if (categorized.bugfixes.length > 0) {
      changelog += '\n## 🐛 Bug Fixes\n\n';
      categorized.bugfixes.forEach(issue => {
        changelog += `- ${issue.title}\n`;
      });
    }

    if (categorized.improvements.length > 0) {
      changelog += '\n## ⚡ Improvements\n\n';
      categorized.improvements.forEach(issue => {
        changelog += `- ${issue.title}\n`;
      });
    }

    return changelog;
  }

  private generateFallbackSummary(stats: { features: number; bugfixes: number; improvements: number; total: number }): string {
    return `This release includes ${stats.total} updates with ${stats.features} new features, ${stats.bugfixes} bug fixes, and ${stats.improvements} improvements. These changes enhance functionality, stability, and user experience.`;
  }
}
