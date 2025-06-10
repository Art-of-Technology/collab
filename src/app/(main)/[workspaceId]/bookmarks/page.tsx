import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getUserBookmarks } from "@/actions/bookmark";
import BookmarksClient from "./BookmarksClient";

export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get current workspace from cookie
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('currentWorkspaceId')?.value;

  // If no workspace ID found, redirect to create workspace
  if (!workspaceId) {
    redirect('/create-workspace');
  }
  
  // Use our server action to get bookmarks
  const bookmarks = await getUserBookmarks();
  
  // Extract post data from bookmarks
  const bookmarkedPosts = bookmarks.map(bookmark => bookmark.post);
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        <p className="text-muted-foreground">
          Posts you&apos;ve saved for later
        </p>
      </div>
      
      <BookmarksClient 
        initialBookmarkedPosts={bookmarkedPosts}
        currentUserId={user.id}
      />
    </div>
  );
} 