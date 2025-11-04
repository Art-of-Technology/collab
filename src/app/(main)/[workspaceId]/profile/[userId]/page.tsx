import { redirect, notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getUserProfile } from "@/actions/user";
import UserProfileClient from "@/components/profile/UserProfileClient";

interface UserProfilePageProps {
  params: {
    userId: string;
    workspaceId: string;
  };
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const _params = await params;
  const { userId, workspaceId } = _params;
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  try {
    // Get profile data using server action (workspace-scoped)
    const profileData = await getUserProfile(userId, workspaceId);
    
    // Render the client component with initial data
    return <UserProfileClient userId={userId} initialData={profileData} />;
  } catch (error) {
    // If this is the current user's profile, redirect to /profile
    if (error instanceof Error && error.message === 'self_profile') {
      redirect(`/${workspaceId}/profile`);
    }
    
    // If user not found
    if (error instanceof Error && error.message === 'User not found') {
      notFound();
    }
    
    // For any other error, redirect to workspace timeline
    redirect(`/${workspaceId}/timeline`);
  }
} 