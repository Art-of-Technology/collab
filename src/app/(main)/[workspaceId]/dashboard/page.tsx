import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess, getWorkspaceSlugOrId } from "@/lib/workspace-helpers";
import {
  getRecentPostsByType,
  getUserPosts,
  getPopularTags,
  getUnansweredPosts,
  getTeamMetrics,
  getRecentActivities,
} from "@/actions/dashboard";

// Import client components
import AIDashboard from "./components/AIDashboard";
import { TeamActivity } from "./components/TeamActivity";
import { UserPosts } from "./components/UserPosts";
import { PostsByType } from "./components/PostsByType";
import { PopularTags } from "./components/PopularTags";
import { UnansweredPosts } from "./components/UnansweredPosts";
import { MyLeave } from "./components/MyLeave";
import { LeaveRequestsDashboardContainer } from "@/components/hr/LeaveRequestsDashboardContainer";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your AI-powered workspace dashboard",
};

export default async function DashboardPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  let workspaceId = "";
  let workspaceSlug = "";
  try {
    workspaceId = await verifyWorkspaceAccess(session.user);
    // Get workspace slug for navigation
    workspaceSlug = await getWorkspaceSlugOrId(session.user, params.workspaceId) || params.workspaceId;
  } catch (error) {
    console.error("Error verifying workspace access:", error);
    redirect("/welcome");
  }

  // Fetch initial data for hydration
  const [
    blockers,
    ideas,
    questions,
    userPostsData,
    tagsData,
    unansweredPostsData,
    activitiesData,
  ] = await Promise.all([
    getRecentPostsByType({ workspaceId, type: "BLOCKER" }),
    getRecentPostsByType({ workspaceId, type: "IDEA" }),
    getRecentPostsByType({ workspaceId, type: "QUESTION" }),
    getUserPosts({ workspaceId, userId: session.user.id }),
    getPopularTags({ workspaceId }),
    getUnansweredPosts({ workspaceId }),
    getRecentActivities({ workspaceId }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* AI-Powered Dashboard Header */}
      <AIDashboard
        workspaceSlug={workspaceSlug}
        userName={session.user.name || ""}
      />

      {/* Divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="h-px flex-1 bg-[#27272a]" />
        <span className="text-xs text-[#52525b]">Team Activity</span>
        <div className="h-px flex-1 bg-[#27272a]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Blockers Section */}
        <PostsByType type="BLOCKER" workspaceId={workspaceId} initialPosts={blockers} />

        {/* Unanswered Questions/Blockers */}
        <UnansweredPosts workspaceId={workspaceId} initialPosts={unansweredPostsData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ideas Section */}
        <PostsByType type="IDEA" workspaceId={workspaceId} initialPosts={ideas} />

        <div className="grid grid-cols-1 gap-4">
          {/* Popular Tags Section */}
          <PopularTags workspaceId={workspaceId} initialTags={tagsData} />

          {/* Questions Section */}
          <PostsByType type="QUESTION" workspaceId={workspaceId} initialPosts={questions} />
        </div>
      </div>
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        {/* My Leave */}
        <MyLeave workspaceId={workspaceId} />
        {/* Leave Management Section (for managers) */}
        <LeaveRequestsDashboardContainer workspaceId={workspaceId} />
      </div>
    </div>
  );
} 