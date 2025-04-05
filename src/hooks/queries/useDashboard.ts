'use client';

import { useQuery } from '@tanstack/react-query';
import { 
  getRecentPostsByType, 
  getUserPosts,
  getPopularTags,
  getUnansweredPosts,
  getTeamMetrics,
  getRecentActivities
} from '@/actions/dashboard';

// Define query keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
  posts: () => [...dashboardKeys.all, 'posts'] as const,
  postsByType: (type: string, workspaceId: string) => [...dashboardKeys.posts(), type, workspaceId] as const,
  userPosts: (userId: string, workspaceId: string) => [...dashboardKeys.posts(), 'user', userId, workspaceId] as const,
  unansweredPosts: (workspaceId: string) => [...dashboardKeys.posts(), 'unanswered', workspaceId] as const,
  tags: (workspaceId: string) => [...dashboardKeys.all, 'tags', workspaceId] as const,
  metrics: (workspaceId: string) => [...dashboardKeys.all, 'metrics', workspaceId] as const,
  activities: (workspaceId: string) => [...dashboardKeys.all, 'activities', workspaceId] as const,
};

// Get recent posts by type
export const useRecentPostsByType = (type: string, workspaceId: string, limit?: number) => {
  return useQuery({
    queryKey: dashboardKeys.postsByType(type, workspaceId),
    queryFn: () => getRecentPostsByType({ type, workspaceId, limit }),
    enabled: !!workspaceId,
  });
};

// Get user posts
export const useUserPosts = (userId: string, workspaceId: string, limit?: number) => {
  return useQuery({
    queryKey: dashboardKeys.userPosts(userId, workspaceId),
    queryFn: () => getUserPosts({ userId, workspaceId, limit }),
    enabled: !!userId && !!workspaceId,
  });
};

// Get popular tags
export const usePopularTags = (workspaceId: string, limit?: number) => {
  return useQuery({
    queryKey: dashboardKeys.tags(workspaceId),
    queryFn: () => getPopularTags({ workspaceId, limit }),
    enabled: !!workspaceId,
  });
};

// Get unanswered posts
export const useUnansweredPosts = (workspaceId: string, limit?: number) => {
  return useQuery({
    queryKey: dashboardKeys.unansweredPosts(workspaceId),
    queryFn: () => getUnansweredPosts({ workspaceId, limit }),
    enabled: !!workspaceId,
  });
};

// Get team metrics
export const useTeamMetrics = (workspaceId: string, days?: number) => {
  return useQuery({
    queryKey: dashboardKeys.metrics(workspaceId),
    queryFn: () => getTeamMetrics({ workspaceId, days }),
    enabled: !!workspaceId,
  });
};

// Get recent activities
export const useRecentActivities = (workspaceId: string, limit?: number) => {
  return useQuery({
    queryKey: dashboardKeys.activities(workspaceId),
    queryFn: () => getRecentActivities({ workspaceId, limit }),
    enabled: !!workspaceId,
  });
}; 