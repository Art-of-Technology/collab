/**
 * Auto-Assign Suggestion Engine
 *
 * Suggests the best team member to assign an issue to based on:
 * - Issue content and required skills
 * - Team member expertise and availability
 * - Historical assignment patterns
 * - Current workload
 */

import { getAIOrchestrator } from '../core/orchestrator';

// ============================================================================
// Types
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  expertise?: string[];
  currentWorkload?: number; // Number of assigned in-progress issues
  recentlyAssigned?: string[]; // Recent issue types/labels they've worked on
  availability?: 'available' | 'busy' | 'away';
}

export interface IssueForAssignment {
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  labels?: string[];
  projectName?: string;
}

export interface AssignmentSuggestion {
  userId: string;
  userName: string;
  score: number;
  reasons: string[];
  confidence: number;
}

export interface AssignmentResult {
  suggestions: AssignmentSuggestion[];
  reasoning: string;
}

export interface WorkloadAnalysis {
  userId: string;
  userName: string;
  totalAssigned: number;
  inProgress: number;
  blocked: number;
  capacityScore: number; // 0-1, higher = more capacity
}

// ============================================================================
// Auto-Assign Service
// ============================================================================

export class AutoAssignService {
  private orchestrator = getAIOrchestrator();

  /**
   * Suggest team members to assign an issue to
   */
  async suggestAssignees(
    issue: IssueForAssignment,
    teamMembers: TeamMember[],
    options: {
      maxSuggestions?: number;
      considerWorkload?: boolean;
      historicalWeight?: number; // 0-1, how much to weight past assignments
    } = {}
  ): Promise<AssignmentResult> {
    const maxSuggestions = options.maxSuggestions ?? 3;
    const considerWorkload = options.considerWorkload ?? true;

    if (teamMembers.length === 0) {
      return {
        suggestions: [],
        reasoning: 'No team members available for assignment',
      };
    }

    if (teamMembers.length === 1) {
      return {
        suggestions: [
          {
            userId: teamMembers[0].id,
            userName: teamMembers[0].name,
            score: 1.0,
            reasons: ['Only team member available'],
            confidence: 1.0,
          },
        ],
        reasoning: 'Single team member available',
      };
    }

    // Score each team member
    const scoredMembers = await this.scoreTeamMembers(
      issue,
      teamMembers,
      considerWorkload
    );

    // Sort by score
    scoredMembers.sort((a, b) => b.score - a.score);

    // Take top suggestions
    const suggestions = scoredMembers.slice(0, maxSuggestions);

    // Generate overall reasoning
    const reasoning = await this.generateReasoning(issue, suggestions);

    return {
      suggestions,
      reasoning,
    };
  }

  /**
   * Quick assignment - get the single best assignee
   */
  async getBestAssignee(
    issue: IssueForAssignment,
    teamMembers: TeamMember[]
  ): Promise<AssignmentSuggestion | null> {
    const result = await this.suggestAssignees(issue, teamMembers, {
      maxSuggestions: 1,
    });

    return result.suggestions[0] || null;
  }

  /**
   * Analyze team workload
   */
  analyzeWorkload(
    teamMembers: TeamMember[],
    assignedIssues: Array<{
      assigneeId: string;
      status: string;
      priority: string;
    }>
  ): WorkloadAnalysis[] {
    const workloadMap = new Map<
      string,
      { total: number; inProgress: number; blocked: number }
    >();

    // Initialize
    for (const member of teamMembers) {
      workloadMap.set(member.id, { total: 0, inProgress: 0, blocked: 0 });
    }

    // Count issues per member
    for (const issue of assignedIssues) {
      const current = workloadMap.get(issue.assigneeId);
      if (current) {
        current.total++;
        if (issue.status === 'in_progress') {
          current.inProgress++;
        }
        if (issue.status === 'blocked') {
          current.blocked++;
        }
      }
    }

    // Calculate capacity scores
    const maxInProgress = Math.max(
      ...Array.from(workloadMap.values()).map((w) => w.inProgress),
      1
    );

    return teamMembers.map((member) => {
      const workload = workloadMap.get(member.id) || {
        total: 0,
        inProgress: 0,
        blocked: 0,
      };

      // Capacity score: inverse of relative workload
      // More in-progress issues = lower capacity
      const capacityScore = 1 - workload.inProgress / (maxInProgress + 5);

      return {
        userId: member.id,
        userName: member.name,
        totalAssigned: workload.total,
        inProgress: workload.inProgress,
        blocked: workload.blocked,
        capacityScore: Math.max(0, Math.min(1, capacityScore)),
      };
    });
  }

  /**
   * Check if workload is balanced across team
   */
  isWorkloadBalanced(workloadAnalysis: WorkloadAnalysis[]): {
    isBalanced: boolean;
    imbalanceScore: number;
    recommendation?: string;
  } {
    if (workloadAnalysis.length < 2) {
      return { isBalanced: true, imbalanceScore: 0 };
    }

    const inProgressCounts = workloadAnalysis.map((w) => w.inProgress);
    const avg =
      inProgressCounts.reduce((a, b) => a + b, 0) / inProgressCounts.length;
    const variance =
      inProgressCounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      inProgressCounts.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation (normalized measure of imbalance)
    const imbalanceScore = avg > 0 ? stdDev / avg : 0;
    const isBalanced = imbalanceScore < 0.5;

    let recommendation: string | undefined;
    if (!isBalanced) {
      const overloaded = workloadAnalysis
        .filter((w) => w.inProgress > avg + stdDev)
        .map((w) => w.userName);
      const underloaded = workloadAnalysis
        .filter((w) => w.inProgress < avg - stdDev)
        .map((w) => w.userName);

      if (overloaded.length > 0 && underloaded.length > 0) {
        recommendation = `Consider reassigning some work from ${overloaded.join(', ')} to ${underloaded.join(', ')}`;
      }
    }

    return { isBalanced, imbalanceScore, recommendation };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async scoreTeamMembers(
    issue: IssueForAssignment,
    teamMembers: TeamMember[],
    considerWorkload: boolean
  ): Promise<AssignmentSuggestion[]> {
    const suggestions: AssignmentSuggestion[] = [];

    for (const member of teamMembers) {
      const { score, reasons, confidence } = await this.scoreMember(
        issue,
        member,
        considerWorkload
      );

      suggestions.push({
        userId: member.id,
        userName: member.name,
        score,
        reasons,
        confidence,
      });
    }

    return suggestions;
  }

  private async scoreMember(
    issue: IssueForAssignment,
    member: TeamMember,
    considerWorkload: boolean
  ): Promise<{ score: number; reasons: string[]; confidence: number }> {
    let score = 0.5; // Base score
    const reasons: string[] = [];
    let confidence = 0.7;

    // Factor 1: Expertise match
    if (member.expertise && member.expertise.length > 0) {
      const expertiseScore = this.calculateExpertiseMatch(issue, member);
      score += expertiseScore * 0.3;

      if (expertiseScore > 0.5) {
        reasons.push(
          `Expertise matches: ${member.expertise.filter((e) => this.isRelevantExpertise(issue, e)).join(', ')}`
        );
      }
    }

    // Factor 2: Recent work on similar issues
    if (member.recentlyAssigned && member.recentlyAssigned.length > 0) {
      const recentScore = this.calculateRecentWorkMatch(issue, member);
      score += recentScore * 0.2;

      if (recentScore > 0.3) {
        reasons.push('Recently worked on similar issues');
      }
    }

    // Factor 3: Availability
    if (member.availability) {
      if (member.availability === 'available') {
        score += 0.1;
        reasons.push('Currently available');
      } else if (member.availability === 'away') {
        score -= 0.3;
        reasons.push('Currently away');
        confidence *= 0.5;
      }
    }

    // Factor 4: Workload
    if (considerWorkload && member.currentWorkload !== undefined) {
      const workloadScore = this.calculateWorkloadScore(member.currentWorkload);
      score += workloadScore * 0.2;

      if (member.currentWorkload <= 2) {
        reasons.push('Low current workload');
      } else if (member.currentWorkload >= 5) {
        reasons.push('High current workload');
      }
    }

    // Factor 5: Priority consideration
    if (issue.priority === 'urgent' || issue.priority === 'high') {
      // For urgent issues, prefer more experienced/available members
      if (member.availability === 'available' && (member.currentWorkload ?? 0) < 3) {
        score += 0.1;
        reasons.push('Available for urgent work');
      }
    }

    // Normalize score to 0-1
    score = Math.max(0, Math.min(1, score));

    // Adjust confidence based on available data
    if (!member.expertise || member.expertise.length === 0) {
      confidence *= 0.8;
    }
    if (member.currentWorkload === undefined) {
      confidence *= 0.9;
    }

    return { score, reasons, confidence };
  }

  private calculateExpertiseMatch(
    issue: IssueForAssignment,
    member: TeamMember
  ): number {
    if (!member.expertise || member.expertise.length === 0) {
      return 0;
    }

    const relevantCount = member.expertise.filter((e) =>
      this.isRelevantExpertise(issue, e)
    ).length;

    return relevantCount / member.expertise.length;
  }

  private isRelevantExpertise(
    issue: IssueForAssignment,
    expertise: string
  ): boolean {
    const expertiseLower = expertise.toLowerCase();
    const issueLower = `${issue.title} ${issue.description || ''} ${(issue.labels || []).join(' ')}`.toLowerCase();

    // Direct match
    if (issueLower.includes(expertiseLower)) {
      return true;
    }

    // Common tech keywords mapping
    const techMapping: Record<string, string[]> = {
      frontend: ['react', 'vue', 'angular', 'ui', 'css', 'html', 'component'],
      backend: ['api', 'server', 'database', 'endpoint', 'service'],
      database: ['sql', 'postgres', 'mysql', 'mongo', 'query', 'migration'],
      devops: ['deploy', 'ci', 'cd', 'docker', 'kubernetes', 'infrastructure'],
      security: ['auth', 'authentication', 'security', 'vulnerability', 'xss'],
      testing: ['test', 'qa', 'quality', 'e2e', 'unit test'],
      mobile: ['ios', 'android', 'mobile', 'app'],
    };

    for (const [category, keywords] of Object.entries(techMapping)) {
      if (
        expertiseLower.includes(category) ||
        category.includes(expertiseLower)
      ) {
        if (keywords.some((k) => issueLower.includes(k))) {
          return true;
        }
      }
    }

    return false;
  }

  private calculateRecentWorkMatch(
    issue: IssueForAssignment,
    member: TeamMember
  ): number {
    if (!member.recentlyAssigned || member.recentlyAssigned.length === 0) {
      return 0;
    }

    const issueLabels = issue.labels || [];
    const recentLower = member.recentlyAssigned.map((r) => r.toLowerCase());

    // Check if issue type matches recent work
    if (recentLower.includes(issue.type.toLowerCase())) {
      return 0.5;
    }

    // Check if labels match recent work
    const matchingLabels = issueLabels.filter((label) =>
      recentLower.some(
        (r) => r.includes(label.toLowerCase()) || label.toLowerCase().includes(r)
      )
    );

    return matchingLabels.length > 0 ? 0.3 + matchingLabels.length * 0.1 : 0;
  }

  private calculateWorkloadScore(currentWorkload: number): number {
    // Ideal workload is 2-4 issues in progress
    // Score decreases as workload increases
    if (currentWorkload <= 2) return 0.2;
    if (currentWorkload <= 4) return 0.1;
    if (currentWorkload <= 6) return 0;
    return -0.1 * (currentWorkload - 6);
  }

  private async generateReasoning(
    issue: IssueForAssignment,
    topSuggestions: AssignmentSuggestion[]
  ): Promise<string> {
    if (topSuggestions.length === 0) {
      return 'No suitable assignees found.';
    }

    const topPick = topSuggestions[0];
    const reasons = topPick.reasons.join('; ');

    if (topSuggestions.length === 1) {
      return `Recommended: ${topPick.userName}. ${reasons}`;
    }

    const alternatives = topSuggestions
      .slice(1)
      .map((s) => s.userName)
      .join(', ');

    return `Top recommendation: ${topPick.userName} (${(topPick.score * 100).toFixed(0)}% match). ${reasons}. Alternatives: ${alternatives}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let autoAssignInstance: AutoAssignService | null = null;

export function getAutoAssignService(): AutoAssignService {
  if (!autoAssignInstance) {
    autoAssignInstance = new AutoAssignService();
  }
  return autoAssignInstance;
}
