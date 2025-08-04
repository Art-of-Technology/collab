import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import {
  getRecentPostsByType,
  getUserPosts,
  getPopularTags,
  getUnansweredPosts,
  getTeamMetrics,
  getRecentActivities,
} from "@/actions/dashboard";

// Import client components
import { TeamMetrics } from "./components/TeamMetrics";
import { TeamActivity } from "./components/TeamActivity";
import { UserPosts } from "./components/UserPosts";
import { PostsByType } from "./components/PostsByType";
import { PopularTags } from "./components/PopularTags";
import { UnansweredPosts } from "./components/UnansweredPosts";
import { MyLeave } from "./components/MyLeave";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your team's development activity dashboard",
};

export default async function DashboardPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(session.user);

  // Fetch initial data for hydration
  const [
    blockers,
    ideas,
    questions,
    userPostsData,
    tagsData,
    unansweredPostsData,
    metricsData,
    activitiesData,
  ] = await Promise.all([
    getRecentPostsByType({ workspaceId, type: "BLOCKER" }),
    getRecentPostsByType({ workspaceId, type: "IDEA" }),
    getRecentPostsByType({ workspaceId, type: "QUESTION" }),
    getUserPosts({ workspaceId, userId: session.user.id }),
    getPopularTags({ workspaceId }),
    getUnansweredPosts({ workspaceId }),
    getTeamMetrics({ workspaceId, days: 7 }),
    getRecentActivities({ workspaceId }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Welcome back, {session.user.name}</h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening in your development world today
        </p>
      </div>

      {/* Quick metrics section */}
      <TeamMetrics workspaceId={workspaceId} initialMetrics={metricsData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Activity Section */}
        <TeamActivity workspaceId={workspaceId} initialActivities={activitiesData} />
        
        {/* Your Recent Posts */}
        <UserPosts 
          workspaceId={workspaceId} 
          userId={session.user.id} 
          initialUserPosts={userPostsData} 
        />
      </div>

      {/* Your activity and unanswered questions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Blockers Section */}
        <PostsByType type="BLOCKER" workspaceId={workspaceId} initialPosts={blockers} />

        {/* Unanswered Questions/Blockers */}
        <UnansweredPosts workspaceId={workspaceId} initialPosts={unansweredPostsData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ideas Section */}
        <PostsByType type="IDEA" workspaceId={workspaceId} initialPosts={ideas} />

        <div className="grid grid-cols-1 gap-6">
          {/* Popular Tags Section */}
          <PopularTags workspaceId={workspaceId} initialTags={tagsData} />

          {/* Questions Section */}
          <PostsByType type="QUESTION" workspaceId={workspaceId} initialPosts={questions} />
        </div>
      </div>
      {/* My Leave */}
                <MyLeave workspaceId={workspaceId} isFeatureEnabled={false} />
    </div>
  );
} 