import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getValidWorkspaceId } from "@/lib/workspace-helpers";

export default async function Home() {
  const session = await getAuthSession();

  // If user is not logged in, redirect to login page
  if (!session?.user) {
    redirect("/home");
  } 

  // Determine current workspace using cookie (fallback to any accessible one)
  const workspaceId = await getValidWorkspaceId({ id: session.user.id });

  if (!workspaceId) {
    redirect("/welcome");
  }

  redirect(`/${workspaceId}/dashboard`);
}
