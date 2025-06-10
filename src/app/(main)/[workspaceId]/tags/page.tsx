import { getTags } from "@/actions/tag";
import TagsClient from "@/components/tags/TagsClient";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function TagsPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  // Get initial data from server action
  const initialData = await getTags();

  // Pass data to the client component
  return <TagsClient initialData={initialData} />;
} 