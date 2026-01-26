/**
 * Sprint Health Monitoring Service
 *
 * AI-powered service that monitors sprint health, identifies risks,
 * and provides recommendations for improving sprint outcomes.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import { getAgentRegistry } from './agent-registry';
import type { AIModelId } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface SprintData {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  goals?: string[];
  issues: SprintIssue[];
  teamCapacity?: TeamCapacity[];
  previousSprints?: PreviousSprint[];
}

export interface SprintIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  storyPoints?: number;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  blockedBy?: string[];
  labels?: string[];
  daysInStatus?: number;
}

export interface TeamCapacity {
  memberId: string;
  memberName: string;
  totalCapacity: number; // hours or points
  allocatedCapacity: number;
  availableDays: number;
}

export interface PreviousSprint {
  id: string;
  name: string;
  velocity: number;
  completionRate: number;
  scopeChange: number; // percentage
}

export type HealthStatus = 'healthy' | 'at_risk' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SprintHealthReport {
  sprintId: string;
  sprintName: string;
  generatedAt: Date;
  overallHealth: HealthStatus;
  healthScore: number; // 0-100

  metrics: SprintMetrics;
  risks: SprintRisk[];
  recommendations: Recommendation[];
  insights: string[];

  burndownAnalysis: BurndownAnalysis;
  teamAnalysis: TeamAnalysis;

  summary: string;
  agentName: string;
}

export interface SprintMetrics {
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
  totalIssues: number;
  completedIssues: number;
  remainingIssues: number;
  blockedIssues: number;

  daysElapsed: number;
  daysRemaining: number;
  progressPercentage: number;
  timeElapsedPercentage: number;

  velocity: number;
  projectedVelocity: number;
  averageVelocity?: number;

  scopeChange: number; // issues added after sprint start
  carryover: number; // issues from previous sprint
}

export interface SprintRisk {
  id: string;
  type: 'scope' | 'velocity' | 'blockers' | 'capacity' | 'deadline' | 'quality';
  level: RiskLevel;
  title: string;
  description: string;
  impact: string;
  affectedIssues?: string[];
  suggestedAction?: string;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'scope' | 'process' | 'team' | 'technical';
  title: string;
  description: string;
  expectedOutcome: string;
}

export interface BurndownAnalysis {
  idealRemaining: number;
  actualRemaining: number;
  projectedCompletion: Date | null;
  trend: 'ahead' | 'on_track' | 'behind' | 'at_risk';
  deviationPercentage: number;
}

export interface TeamAnalysis {
  workloadDistribution: WorkloadEntry[];
  overloadedMembers: string[];
  underutilizedMembers: string[];
  blockedMembers: string[];
}

export interface WorkloadEntry {
  memberId: string;
  memberName: string;
  assignedPoints: number;
  completedPoints: number;
  inProgressPoints: number;
  blockedPoints: number;
  utilizationPercentage: number;
}

export interface SprintHealthOptions {
  model?: AIModelId;
  includeAIAnalysis?: boolean;
  riskThresholds?: {
    velocityDeviation: number;
    blockerPercentage: number;
    scopeChangePercentage: number;
  };
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<SprintHealthOptions> = {
  model: 'gpt-4o',
  includeAIAnalysis: true,
  riskThresholds: {
    velocityDeviation: 20, // 20% deviation triggers risk
    blockerPercentage: 10, // 10% blocked triggers risk
    scopeChangePercentage: 15, // 15% scope change triggers risk
  },
};

// ============================================================================
// Sprint Health Monitor
// ============================================================================

export class SprintHealthMonitor {
  private options: Required<SprintHealthOptions>;

  constructor(options: SprintHealthOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a comprehensive sprint health report
   */
  async analyzeSprintHealth(sprint: SprintData): Promise<SprintHealthReport> {
    // Calculate metrics
    const metrics = this.calculateMetrics(sprint);

    // Analyze burndown
    const burndownAnalysis = this.analyzeBurndown(sprint, metrics);

    // Analyze team workload
    const teamAnalysis = this.analyzeTeam(sprint, metrics);

    // Identify risks
    const risks = this.identifyRisks(sprint, metrics, burndownAnalysis, teamAnalysis);

    // Calculate health score
    const healthScore = this.calculateHealthScore(metrics, risks);
    const overallHealth = this.determineHealthStatus(healthScore);

    // Generate AI insights and recommendations
    let insights: string[] = [];
    let recommendations: Recommendation[] = [];
    let summary = '';

    if (this.options.includeAIAnalysis) {
      const aiAnalysis = await this.generateAIAnalysis(sprint, metrics, risks);
      insights = aiAnalysis.insights;
      recommendations = aiAnalysis.recommendations;
      summary = aiAnalysis.summary;
    } else {
      recommendations = this.generateBasicRecommendations(risks);
      summary = this.generateBasicSummary(metrics, overallHealth);
    }

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      generatedAt: new Date(),
      overallHealth,
      healthScore,
      metrics,
      risks,
      recommendations,
      insights,
      burndownAnalysis,
      teamAnalysis,
      summary,
      agentName: 'Scout',
    };
  }

  /**
   * Quick health check without AI analysis
   */
  quickHealthCheck(sprint: SprintData): {
    health: HealthStatus;
    score: number;
    topRisks: SprintRisk[];
  } {
    const metrics = this.calculateMetrics(sprint);
    const burndownAnalysis = this.analyzeBurndown(sprint, metrics);
    const teamAnalysis = this.analyzeTeam(sprint, metrics);
    const risks = this.identifyRisks(sprint, metrics, burndownAnalysis, teamAnalysis);
    const healthScore = this.calculateHealthScore(metrics, risks);

    return {
      health: this.determineHealthStatus(healthScore),
      score: healthScore,
      topRisks: risks.filter((r) => r.level === 'high' || r.level === 'critical').slice(0, 3),
    };
  }

  // ============================================================================
  // Private Methods - Calculations
  // ============================================================================

  private calculateMetrics(sprint: SprintData): SprintMetrics {
    const now = new Date();
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.max(0, totalDays - daysElapsed);

    const totalPoints = sprint.issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const completedIssues = sprint.issues.filter((i) => i.completedAt);
    const completedPoints = completedIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const remainingPoints = totalPoints - completedPoints;

    const blockedIssues = sprint.issues.filter(
      (i) => i.blockedBy && i.blockedBy.length > 0 && !i.completedAt
    ).length;

    // Calculate velocity
    const velocity = daysElapsed > 0 ? completedPoints / daysElapsed : 0;
    const projectedVelocity = daysRemaining > 0 ? remainingPoints / daysRemaining : 0;

    // Calculate average velocity from previous sprints
    let averageVelocity: number | undefined;
    if (sprint.previousSprints && sprint.previousSprints.length > 0) {
      averageVelocity =
        sprint.previousSprints.reduce((sum, s) => sum + s.velocity, 0) /
        sprint.previousSprints.length;
    }

    // Count scope changes (issues added after sprint start)
    const scopeChange = sprint.issues.filter(
      (i) => new Date(i.createdAt) > startDate
    ).length;

    return {
      totalPoints,
      completedPoints,
      remainingPoints,
      totalIssues: sprint.issues.length,
      completedIssues: completedIssues.length,
      remainingIssues: sprint.issues.length - completedIssues.length,
      blockedIssues,
      daysElapsed,
      daysRemaining,
      progressPercentage: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
      timeElapsedPercentage: totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0,
      velocity,
      projectedVelocity,
      averageVelocity,
      scopeChange,
      carryover: 0, // Would need previous sprint data to calculate
    };
  }

  private analyzeBurndown(sprint: SprintData, metrics: SprintMetrics): BurndownAnalysis {
    const totalDays = metrics.daysElapsed + metrics.daysRemaining;
    const idealDailyBurn = metrics.totalPoints / totalDays;
    const idealRemaining = metrics.totalPoints - idealDailyBurn * metrics.daysElapsed;

    const actualRemaining = metrics.remainingPoints;
    const deviationPercentage = idealRemaining > 0
      ? Math.round(((actualRemaining - idealRemaining) / idealRemaining) * 100)
      : 0;

    // Determine trend
    let trend: BurndownAnalysis['trend'];
    if (deviationPercentage <= -10) {
      trend = 'ahead';
    } else if (deviationPercentage <= 10) {
      trend = 'on_track';
    } else if (deviationPercentage <= 30) {
      trend = 'behind';
    } else {
      trend = 'at_risk';
    }

    // Project completion date
    let projectedCompletion: Date | null = null;
    if (metrics.velocity > 0) {
      const daysToComplete = metrics.remainingPoints / metrics.velocity;
      projectedCompletion = new Date();
      projectedCompletion.setDate(projectedCompletion.getDate() + Math.ceil(daysToComplete));
    }

    return {
      idealRemaining,
      actualRemaining,
      projectedCompletion,
      trend,
      deviationPercentage,
    };
  }

  private analyzeTeam(sprint: SprintData, metrics: SprintMetrics): TeamAnalysis {
    const workloadMap = new Map<string, WorkloadEntry>();

    // Initialize workload entries
    for (const issue of sprint.issues) {
      if (!issue.assigneeId) continue;

      let entry = workloadMap.get(issue.assigneeId);
      if (!entry) {
        entry = {
          memberId: issue.assigneeId,
          memberName: issue.assigneeName || issue.assigneeId,
          assignedPoints: 0,
          completedPoints: 0,
          inProgressPoints: 0,
          blockedPoints: 0,
          utilizationPercentage: 0,
        };
        workloadMap.set(issue.assigneeId, entry);
      }

      const points = issue.storyPoints || 0;
      entry.assignedPoints += points;

      if (issue.completedAt) {
        entry.completedPoints += points;
      } else if (issue.blockedBy && issue.blockedBy.length > 0) {
        entry.blockedPoints += points;
      } else if (
        issue.status.toLowerCase().includes('progress') ||
        issue.status.toLowerCase().includes('doing')
      ) {
        entry.inProgressPoints += points;
      }
    }

    // Calculate utilization and identify issues
    const workloadDistribution = Array.from(workloadMap.values());
    const avgAssigned = workloadDistribution.length > 0
      ? workloadDistribution.reduce((sum, w) => sum + w.assignedPoints, 0) / workloadDistribution.length
      : 0;

    const overloadedMembers: string[] = [];
    const underutilizedMembers: string[] = [];
    const blockedMembers: string[] = [];

    for (const entry of workloadDistribution) {
      entry.utilizationPercentage = avgAssigned > 0
        ? Math.round((entry.assignedPoints / avgAssigned) * 100)
        : 0;

      if (entry.utilizationPercentage > 150) {
        overloadedMembers.push(entry.memberName);
      } else if (entry.utilizationPercentage < 50 && entry.assignedPoints > 0) {
        underutilizedMembers.push(entry.memberName);
      }

      if (entry.blockedPoints > entry.assignedPoints * 0.3) {
        blockedMembers.push(entry.memberName);
      }
    }

    return {
      workloadDistribution,
      overloadedMembers,
      underutilizedMembers,
      blockedMembers,
    };
  }

  private identifyRisks(
    sprint: SprintData,
    metrics: SprintMetrics,
    burndown: BurndownAnalysis,
    team: TeamAnalysis
  ): SprintRisk[] {
    const risks: SprintRisk[] = [];
    const thresholds = this.options.riskThresholds;

    // Deadline risk
    if (burndown.trend === 'at_risk') {
      risks.push({
        id: 'deadline-critical',
        type: 'deadline',
        level: 'critical',
        title: 'Sprint at Risk of Missing Deadline',
        description: `Current burn rate indicates the sprint will not complete on time. ${burndown.deviationPercentage}% behind ideal progress.`,
        impact: 'Sprint goals will not be met without intervention',
        suggestedAction: 'Consider descoping, adding resources, or extending sprint',
      });
    } else if (burndown.trend === 'behind') {
      risks.push({
        id: 'deadline-warning',
        type: 'deadline',
        level: 'medium',
        title: 'Sprint Falling Behind Schedule',
        description: `Currently ${burndown.deviationPercentage}% behind ideal progress.`,
        impact: 'May need to adjust scope or increase velocity',
        suggestedAction: 'Focus on completing high-priority items',
      });
    }

    // Blocker risk
    const blockerPercentage = (metrics.blockedIssues / metrics.totalIssues) * 100;
    if (blockerPercentage > thresholds.blockerPercentage) {
      const blockedIssues = sprint.issues
        .filter((i) => i.blockedBy && i.blockedBy.length > 0 && !i.completedAt)
        .map((i) => i.identifier);

      risks.push({
        id: 'blockers-high',
        type: 'blockers',
        level: blockerPercentage > 20 ? 'high' : 'medium',
        title: 'High Number of Blocked Issues',
        description: `${metrics.blockedIssues} issues (${Math.round(blockerPercentage)}%) are currently blocked.`,
        impact: 'Team velocity is reduced due to dependencies',
        affectedIssues: blockedIssues,
        suggestedAction: 'Prioritize unblocking activities and dependency resolution',
      });
    }

    // Scope change risk
    const scopeChangePercentage = (metrics.scopeChange / metrics.totalIssues) * 100;
    if (scopeChangePercentage > thresholds.scopeChangePercentage) {
      risks.push({
        id: 'scope-creep',
        type: 'scope',
        level: scopeChangePercentage > 30 ? 'high' : 'medium',
        title: 'Significant Scope Change Detected',
        description: `${metrics.scopeChange} issues (${Math.round(scopeChangePercentage)}%) were added after sprint start.`,
        impact: 'Original sprint commitment may not be achievable',
        suggestedAction: 'Review and prioritize new items, consider removing lower priority items',
      });
    }

    // Velocity risk
    if (metrics.averageVelocity) {
      const velocityDeviation =
        ((metrics.velocity - metrics.averageVelocity) / metrics.averageVelocity) * 100;
      if (velocityDeviation < -thresholds.velocityDeviation) {
        risks.push({
          id: 'velocity-low',
          type: 'velocity',
          level: velocityDeviation < -40 ? 'high' : 'medium',
          title: 'Velocity Below Historical Average',
          description: `Current velocity is ${Math.abs(Math.round(velocityDeviation))}% below average.`,
          impact: 'Sprint delivery at risk',
          suggestedAction: 'Investigate blockers and process improvements',
        });
      }
    }

    // Capacity/team risk
    if (team.overloadedMembers.length > 0) {
      risks.push({
        id: 'team-overloaded',
        type: 'capacity',
        level: team.overloadedMembers.length > 2 ? 'high' : 'medium',
        title: 'Team Members Overloaded',
        description: `${team.overloadedMembers.length} team members have significantly more work than average.`,
        impact: 'Risk of burnout and quality issues',
        suggestedAction: `Consider redistributing work from: ${team.overloadedMembers.join(', ')}`,
      });
    }

    if (team.blockedMembers.length > 0) {
      risks.push({
        id: 'team-blocked',
        type: 'blockers',
        level: 'medium',
        title: 'Team Members Blocked',
        description: `${team.blockedMembers.length} team members have significant blocked work.`,
        impact: 'Team productivity reduced',
        suggestedAction: `Help unblock: ${team.blockedMembers.join(', ')}`,
      });
    }

    return risks.sort((a, b) => {
      const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return levelOrder[a.level] - levelOrder[b.level];
    });
  }

  private calculateHealthScore(metrics: SprintMetrics, risks: SprintRisk[]): number {
    let score = 100;

    // Progress vs time penalty
    const progressGap = metrics.timeElapsedPercentage - metrics.progressPercentage;
    if (progressGap > 0) {
      score -= Math.min(progressGap * 0.5, 30);
    }

    // Risk penalties
    for (const risk of risks) {
      switch (risk.level) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }

    // Blocker penalty
    const blockerRatio = metrics.blockedIssues / metrics.remainingIssues;
    score -= blockerRatio * 20;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private determineHealthStatus(score: number): HealthStatus {
    if (score >= 70) return 'healthy';
    if (score >= 40) return 'at_risk';
    return 'critical';
  }

  private async generateAIAnalysis(
    sprint: SprintData,
    metrics: SprintMetrics,
    risks: SprintRisk[]
  ): Promise<{
    insights: string[];
    recommendations: Recommendation[];
    summary: string;
  }> {
    const orchestrator = getAIOrchestrator();
    const registry = getAgentRegistry();

    const agent = registry.getAgent('scout') || registry.getAgent('default-scout');
    const systemPrompt = agent?.systemPrompt || 'You are an expert project analyst.';

    const prompt = `Analyze this sprint health data and provide insights:

**Sprint:** ${sprint.name}
**Progress:** ${metrics.progressPercentage}% complete, ${metrics.timeElapsedPercentage}% of time elapsed
**Points:** ${metrics.completedPoints}/${metrics.totalPoints} completed
**Issues:** ${metrics.completedIssues}/${metrics.totalIssues} completed
**Blocked:** ${metrics.blockedIssues} issues
**Days Remaining:** ${metrics.daysRemaining}

**Identified Risks:**
${risks.map((r) => `- [${r.level.toUpperCase()}] ${r.title}: ${r.description}`).join('\n')}

Please provide:
1. 3-5 key insights about the sprint health
2. 3-5 prioritized recommendations
3. A brief executive summary (2-3 sentences)

Format as JSON:
{
  "insights": ["insight1", "insight2", ...],
  "recommendations": [
    {"priority": "high|medium|low", "category": "scope|process|team|technical", "title": "...", "description": "...", "expectedOutcome": "..."},
    ...
  ],
  "summary": "..."
}`;

    try {
      const response = await orchestrator.complete({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt,
        model: this.options.model,
        maxTokens: 1500,
        responseFormat: 'json',
      });

      const parsed = JSON.parse(response.content);
      return {
        insights: parsed.insights || [],
        recommendations: parsed.recommendations || [],
        summary: parsed.summary || this.generateBasicSummary(metrics, this.determineHealthStatus(this.calculateHealthScore(metrics, risks))),
      };
    } catch {
      return {
        insights: [],
        recommendations: this.generateBasicRecommendations(risks),
        summary: this.generateBasicSummary(metrics, this.determineHealthStatus(this.calculateHealthScore(metrics, risks))),
      };
    }
  }

  private generateBasicRecommendations(risks: SprintRisk[]): Recommendation[] {
    return risks
      .filter((r) => r.suggestedAction)
      .map((r) => ({
        priority: r.level === 'critical' ? 'high' : r.level === 'high' ? 'high' : 'medium',
        category: r.type === 'scope' ? 'scope' : r.type === 'capacity' ? 'team' : 'process',
        title: r.title,
        description: r.suggestedAction || '',
        expectedOutcome: `Mitigate ${r.type} risk`,
      })) as Recommendation[];
  }

  private generateBasicSummary(metrics: SprintMetrics, health: HealthStatus): string {
    const healthText = {
      healthy: 'on track',
      at_risk: 'at risk',
      critical: 'in critical condition',
    };

    return `Sprint is ${healthText[health]} with ${metrics.progressPercentage}% completion and ${metrics.daysRemaining} days remaining. ${metrics.blockedIssues > 0 ? `${metrics.blockedIssues} issues are currently blocked.` : ''}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let healthMonitorInstance: SprintHealthMonitor | null = null;

export function getSprintHealthMonitor(
  options?: SprintHealthOptions
): SprintHealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new SprintHealthMonitor(options);
  }
  return healthMonitorInstance;
}
