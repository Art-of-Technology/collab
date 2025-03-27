import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-muted-foreground">
          Coming soon
        </p>
      </div>
    </div>
  );
} 