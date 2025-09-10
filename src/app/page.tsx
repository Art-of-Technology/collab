import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getWorkspaceSlugOrId } from "@/lib/workspace-helpers";

export default async function Home() {
  const session = await getAuthSession();

  // If user is not logged in, redirect to login page
  if (!session?.user) {
    redirect("/home");
  } 

  // Determine current workspace using cookie (fallback to any accessible one)
  const workspaceSlugOrId = await getWorkspaceSlugOrId({ id: session.user.id });
  
  // If user has a workspace, redirect to it
  if (workspaceSlugOrId) {
    redirect(`/${workspaceSlugOrId}/dashboard`);
  } else {
    // No workspace found, redirect to welcome page
    redirect("/welcome");
  }
}
