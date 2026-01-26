/**
 * Duplicate Detection Service
 *
 * Uses semantic search with embeddings to find potential duplicate issues.
 * Helps prevent duplicate work and links related issues.
 */

import { getAIOrchestrator } from '../core/orchestrator';
import type { AIModelId } from '../core/types';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface IssueForDuplication {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status?: string;
  createdAt: Date;
  issueKey?: string | null;
}

export interface DuplicateCandidate {
  issue: IssueForDuplication;
  similarityScore: number;
  matchType: 'exact_title' | 'similar_content' | 'related_topic';
  explanation?: string;
}

export interface DuplicateSearchResult {
  candidates: DuplicateCandidate[];
  searchedCount: number;
  processingTimeMs: number;
}

export interface EmbeddingCacheEntry {
  embedding: number[];
  contentHash: string;
  createdAt: Date;
}

// ============================================================================
// Duplicate Detection Service
// ============================================================================

export class DuplicateDetectionService {
  private orchestrator = getAIOrchestrator();
  private embeddingCache: Map<string, EmbeddingCacheEntry> = new Map();
  private similarityThreshold = 0.75; // Minimum similarity to consider duplicate
  private maxCandidates = 5; // Maximum candidates to return

  /**
   * Find potential duplicates for a new issue
   */
  async findDuplicates(
    newIssue: Pick<IssueForDuplication, 'title' | 'description'>,
    existingIssues: IssueForDuplication[],
    options: {
      threshold?: number;
      maxCandidates?: number;
      includeExplanation?: boolean;
    } = {}
  ): Promise<DuplicateSearchResult> {
    const startTime = Date.now();
    const threshold = options.threshold ?? this.similarityThreshold;
    const maxCandidates = options.maxCandidates ?? this.maxCandidates;

    if (existingIssues.length === 0) {
      return {
        candidates: [],
        searchedCount: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 1: Quick exact title match check
    const exactMatches = this.findExactTitleMatches(newIssue, existingIssues);

    // Step 2: Generate embedding for new issue
    const newIssueText = this.buildSearchText(newIssue.title, newIssue.description);
    const newEmbedding = await this.getEmbedding(newIssueText);

    // Step 3: Generate embeddings for existing issues (use cache when possible)
    const existingWithEmbeddings = await this.getEmbeddingsForIssues(
      existingIssues
    );

    // Step 4: Calculate similarity scores
    const candidates: DuplicateCandidate[] = [];

    // Add exact matches first
    for (const match of exactMatches) {
      candidates.push({
        issue: match,
        similarityScore: 1.0,
        matchType: 'exact_title',
        explanation: 'Exact title match',
      });
    }

    // Calculate cosine similarity for semantic matches
    for (const { issue, embedding } of existingWithEmbeddings) {
      // Skip if already in exact matches
      if (exactMatches.some((m) => m.id === issue.id)) {
        continue;
      }

      const similarity = this.cosineSimilarity(newEmbedding, embedding);

      if (similarity >= threshold) {
        candidates.push({
          issue,
          similarityScore: similarity,
          matchType: similarity > 0.9 ? 'similar_content' : 'related_topic',
        });
      }
    }

    // Sort by similarity score (descending)
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);

    // Take top candidates
    const topCandidates = candidates.slice(0, maxCandidates);

    // Optionally add AI explanations
    if (options.includeExplanation && topCandidates.length > 0) {
      await this.addExplanations(newIssue, topCandidates);
    }

    return {
      candidates: topCandidates,
      searchedCount: existingIssues.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Check if an issue is likely a duplicate
   */
  async isDuplicate(
    newIssue: Pick<IssueForDuplication, 'title' | 'description'>,
    existingIssues: IssueForDuplication[]
  ): Promise<{
    isDuplicate: boolean;
    confidence: number;
    mostSimilar?: DuplicateCandidate;
  }> {
    const result = await this.findDuplicates(newIssue, existingIssues, {
      maxCandidates: 1,
      threshold: 0.85,
    });

    if (result.candidates.length === 0) {
      return { isDuplicate: false, confidence: 0.9 };
    }

    const topMatch = result.candidates[0];
    const isDuplicate = topMatch.similarityScore > 0.9;

    return {
      isDuplicate,
      confidence: topMatch.similarityScore,
      mostSimilar: topMatch,
    };
  }

  /**
   * Find similar issues to an existing one (for suggestions)
   */
  async findSimilar(
    issue: IssueForDuplication,
    allIssues: IssueForDuplication[],
    limit: number = 5
  ): Promise<DuplicateCandidate[]> {
    // Exclude the issue itself
    const otherIssues = allIssues.filter((i) => i.id !== issue.id);

    const result = await this.findDuplicates(
      { title: issue.title, description: issue.description },
      otherIssues,
      { maxCandidates: limit, threshold: 0.5 }
    );

    return result.candidates;
  }

  /**
   * Generate and cache embedding for an issue
   */
  async generateAndCacheEmbedding(
    issue: IssueForDuplication
  ): Promise<number[]> {
    const text = this.buildSearchText(issue.title, issue.description);
    const contentHash = this.hashContent(text);

    // Check cache
    const cached = this.embeddingCache.get(issue.id);
    if (cached && cached.contentHash === contentHash) {
      return cached.embedding;
    }

    // Generate new embedding
    const embedding = await this.getEmbedding(text);

    // Cache it
    this.embeddingCache.set(issue.id, {
      embedding,
      contentHash,
      createdAt: new Date(),
    });

    return embedding;
  }

  /**
   * Invalidate cache for an issue (call when issue is updated)
   */
  invalidateCache(issueId: string): void {
    this.embeddingCache.delete(issueId);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private findExactTitleMatches(
    newIssue: Pick<IssueForDuplication, 'title'>,
    existingIssues: IssueForDuplication[]
  ): IssueForDuplication[] {
    const normalizedTitle = this.normalizeText(newIssue.title);

    return existingIssues.filter(
      (issue) => this.normalizeText(issue.title) === normalizedTitle
    );
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  private buildSearchText(title: string, description?: string | null): string {
    if (!description) {
      return title;
    }

    // Combine title and description, but limit description length
    const truncatedDesc = description.slice(0, 500);
    return `${title}\n\n${truncatedDesc}`;
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await this.orchestrator.embed({
      input: text,
      dimensions: 1536,
    });
    return response.embeddings[0];
  }

  private async getEmbeddingsForIssues(
    issues: IssueForDuplication[]
  ): Promise<Array<{ issue: IssueForDuplication; embedding: number[] }>> {
    const results: Array<{ issue: IssueForDuplication; embedding: number[] }> =
      [];
    const needsEmbedding: Array<{
      issue: IssueForDuplication;
      text: string;
      index: number;
    }> = [];

    // Check cache first
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const text = this.buildSearchText(issue.title, issue.description);
      const contentHash = this.hashContent(text);

      const cached = this.embeddingCache.get(issue.id);
      if (cached && cached.contentHash === contentHash) {
        results.push({ issue, embedding: cached.embedding });
      } else {
        needsEmbedding.push({ issue, text, index: i });
      }
    }

    // Batch generate missing embeddings
    if (needsEmbedding.length > 0) {
      const texts = needsEmbedding.map((item) => item.text);

      // Process in batches of 50 to avoid rate limits
      const batchSize = 50;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batchTexts = texts.slice(i, i + batchSize);
        const batchItems = needsEmbedding.slice(i, i + batchSize);

        const response = await this.orchestrator.embed({
          input: batchTexts,
          dimensions: 1536,
        });

        for (let j = 0; j < batchItems.length; j++) {
          const item = batchItems[j];
          const embedding = response.embeddings[j];

          // Cache the embedding
          this.embeddingCache.set(item.issue.id, {
            embedding,
            contentHash: this.hashContent(item.text),
            createdAt: new Date(),
          });

          results.push({ issue: item.issue, embedding });
        }
      }
    }

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  private hashContent(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private async addExplanations(
    newIssue: Pick<IssueForDuplication, 'title' | 'description'>,
    candidates: DuplicateCandidate[]
  ): Promise<void> {
    // Only explain top 3 to save API calls
    const toExplain = candidates.slice(0, 3);

    const systemPrompt = `You are helping identify duplicate or related issues.

Given a new issue and a potential match, explain in 1-2 sentences why they might be duplicates or related.

Focus on:
- Similar problem being described
- Overlapping scope or requirements
- Same underlying issue

Be concise and specific.`;

    for (const candidate of toExplain) {
      if (candidate.explanation) continue; // Already has explanation

      try {
        const explanation = await this.orchestrator.quickComplete(
          `New issue: "${newIssue.title}"
${newIssue.description ? `New description: ${newIssue.description.slice(0, 200)}...` : ''}

Potential match: "${candidate.issue.title}"
${candidate.issue.description ? `Match description: ${candidate.issue.description.slice(0, 200)}...` : ''}

Similarity score: ${(candidate.similarityScore * 100).toFixed(0)}%

Why might these be duplicates or related?`,
          {
            systemPrompt,
            model: 'claude-haiku-3.5',
            temperature: 0.3,
            maxTokens: 100,
          }
        );

        candidate.explanation = explanation.trim();
      } catch {
        // Skip explanation if it fails
        candidate.explanation = `${(candidate.similarityScore * 100).toFixed(0)}% similar based on content analysis`;
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let duplicateDetectionInstance: DuplicateDetectionService | null = null;

export function getDuplicateDetectionService(): DuplicateDetectionService {
  if (!duplicateDetectionInstance) {
    duplicateDetectionInstance = new DuplicateDetectionService();
  }
  return duplicateDetectionInstance;
}
