import { getInProgressTasks } from "@/actions/get-in-progress-tasks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InProgressTasksPage() {
  const { tasks } = await getInProgressTasks();

  return (
    <div className="space-y-8 p-4 md:p-8">
      <h1 className="text-2xl font-bold">In Progress Tasks</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <Card key={task.id}>
            <CardHeader>
              <CardTitle>{task.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Board: {task.taskBoard?.name}
              </p>
              {task.assignee && (
                <div className="mt-4 flex items-center space-x-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={task.assignee.image ?? undefined} />
                    <AvatarFallback>{task.assignee.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{task.assignee.name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}