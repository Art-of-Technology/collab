import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getWorkspaceSlugOrId } from "@/lib/workspace-helpers";

export default async function Home() {
  const session = await getAuthSession();

  // If user is not logged in, redirect to login page
  if (!session?.user) {
    redirect("/home");
  } 

  try {
    // Determine current workspace using cookie (fallback to any accessible one)
      const workspaceSlugOrId = await getWorkspaceSlugOrId({ id: session.user.id });
      redirect(`/${workspaceSlugOrId}/dashboard`);
    } catch (error) {
      console.error("Error loading workspace:", error);
      redirect("/welcome");
    }
}
