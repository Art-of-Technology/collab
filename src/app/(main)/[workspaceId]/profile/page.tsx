import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getPosts } from "@/actions/post";
import { getCurrentUser } from "@/lib/session";
import ProfileClient from "@/components/profile/ProfileClient";

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const _params = await params;
  const { workspaceId } = _params;
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get current user
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  const initialData = await getPosts({
    authorId: user.id,
    workspaceId: workspaceId,
    limit: 10,
    includeProfileData: true
  });
  
  const initialPosts = Array.isArray(initialData) 
    ? initialData 
    : (initialData?.posts || []);
  
  // Render the client component with initial data
  return (
    <ProfileClient 
      initialData={{
        user: initialData?.user || null,
        stats: initialData?.stats || null,
        posts: initialPosts
      }}
    />
  );
} 