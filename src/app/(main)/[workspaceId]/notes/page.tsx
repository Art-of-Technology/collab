import { redirect } from "next/navigation";

// Notes are listed in Context. This address is kept for the links that were made to the old list.
export default async function NotesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  redirect(`/${(await params).workspaceId}/context`);
}
