import { getCurrentUser } from "@/lib/session";
import { getPosts } from "@/actions/post";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import TimelineClient from "@/components/timeline/TimelineClient";

interface TimelinePageProps {
  searchParams: { 
    filter?: string;
    tag?: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function TimelinePage({
  searchParams,
}: TimelinePageProps) {
  const _searchParams = await searchParams;
  const user = await getCurrentUser();
  
  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(user);
  
  // Safely handle searchParams
  const filterParam = _searchParams?.filter;
  const tagParam = _searchParams?.tag;
  
  const filter = typeof filterParam === 'string' ? filterParam.toLowerCase() : undefined;
  const tag = typeof tagParam === 'string' ? tagParam : undefined;
  
  // Map URL filter to database filter
  const filterMap: { [key: string]: string } = {
    'updates': 'UPDATE',
    'blockers': 'BLOCKER',
    'ideas': 'IDEA',
    'questions': 'QUESTION',
  };
  
  // Get the type filter value if it exists
  const typeFilter = filter && filterMap[filter] ? filterMap[filter] as any : undefined;
  
  // Fetch initial posts using the server action
  const initialPostsData = await getPosts({
    type: typeFilter,
    tag: tag,
    workspaceId,
    limit: 10
  });
  
  // Handle both old and new response formats
  const initialPosts = Array.isArray(initialPostsData) 
    ? initialPostsData 
    : initialPostsData.posts || [];
  return (
    <TimelineClient 
      initialPosts={initialPosts} 
      currentUserId={user?.id || ''} 
    />
  );
} 