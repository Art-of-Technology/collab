import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getTasksData } from "@/actions/getTasks";
import TasksClient from "@/components/tasks/TasksClient";

export default async function TasksPage() {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  // Get initial data from server action
  const initialData = await getTasksData();
  
  // Pass data to the client component
  return <TasksClient initialData={initialData} />;
} 