import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getWorkspaceSlugOrId } from "@/lib/workspace-helpers";

// Helper to check if error is a Next.js redirect
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as any).digest === "string" &&
    (error as any).digest.startsWith("NEXT_REDIRECT")
  );
}

export default async function Home() {
  const session = await getAuthSession();

  // If user is not logged in, redirect to login page
  if (!session?.user) {
    redirect("/home");
  }

  try {
    // Determine current workspace using cookie (fallback to any accessible one)
    const workspaceSlugOrId = await getWorkspaceSlugOrId({ id: session.user.id });
    if (!workspaceSlugOrId) {
      redirect("/welcome");
    }
    redirect(`/${workspaceSlugOrId}/dashboard`);
  } catch (error) {
    // Re-throw redirect errors - they're not actual errors
    if (isNextRedirect(error)) {
      throw error;
    }
    console.error("Error loading workspace:", error);
    redirect("/welcome");
  }
}
