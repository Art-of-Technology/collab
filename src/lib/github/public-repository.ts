import type { Prisma } from '@prisma/client';

export const PUBLIC_REPOSITORY_SELECT = {
  id: true,
  projectId: true,
  githubRepoId: true,
  owner: true,
  name: true,
  fullName: true,
  defaultBranch: true,
  webhookId: true,
  isActive: true,
  syncedAt: true,
  createdAt: true,
  updatedAt: true,
  developmentBranch: true,
  versioningStrategy: true,
  branchEnvironmentMap: true,
  issueTypeMapping: true,
  aiReviewEnabled: true,
  aiReviewAutoTrigger: true,
} satisfies Prisma.RepositorySelect;
