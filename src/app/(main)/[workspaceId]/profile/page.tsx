import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getCurrentUserProfile } from "@/actions/user";
import ProfileClient from "@/components/profile/ProfileClient";

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get profile data using server action
  const profileData = await getCurrentUserProfile();
  
  // Render the client component with initial data
  return <ProfileClient initialData={profileData} />;
} 