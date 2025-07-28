"use client";

import { ReactNode } from "react";
import { TasksProvider } from "@/context/TasksContext";
import { useSearchParams } from "next/navigation";
import { TaskModalProvider } from "@/context/TaskModalContext";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

interface TasksLayoutProps {
  children: ReactNode;
}

export default function TasksLayout({ children }: TasksLayoutProps) {
  const searchParams = useSearchParams();
  const boardId = searchParams.get("board") || undefined;
  const viewParam = searchParams.get("view") || "kanban";
  const view = (viewParam === "list" || viewParam === "kanban") ? viewParam : "kanban";

  return (
    <Suspense fallback={<div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <TasksProvider initialBoardId={boardId} initialView={view}>
        <TaskModalProvider>
          {children}
        </TaskModalProvider>
      </TasksProvider>
    </Suspense>
  );
} 