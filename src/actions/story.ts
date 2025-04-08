import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { hasAccessToWorkspace } from "@/lib/workspace-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const StorySchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.date().optional(),
  workspaceId: z.string().min(1, { message: "Workspace is required" }),
  epicId: z.string().optional(),
});

// Get all stories for a workspace
export async function getWorkspaceStories(workspaceId: string) {
  const { userId } = auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  const canAccess = await hasAccessToWorkspace(userId, workspaceId);
  
  if (!canAccess) {
    redirect("/dashboard");
  }
  
  try {
    const stories = await db.story.findMany({
      where: {
        workspaceId,
      },
      include: {
        assignee: true,
        epic: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    
    return stories;
  } catch (error) {
    console.error("Error fetching stories:", error);
    throw new Error("Failed to fetch stories");
  }
}

// Get a story by ID
export async function getStoryById(storyId: string) {
  const { userId } = auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  try {
    const story = await db.story.findUnique({
      where: {
        id: storyId,
      },
      include: {
        assignee: true,
        epic: true,
      },
    });
    
    if (!story) {
      throw new Error("Story not found");
    }
    
    const canAccess = await hasAccessToWorkspace(userId, story.workspaceId);
    
    if (!canAccess) {
      redirect("/dashboard");
    }
    
    return story;
  } catch (error) {
    console.error("Error fetching story:", error);
    throw new Error("Failed to fetch story");
  }
}

// Create a new story
export async function createStory(data: z.infer<typeof StorySchema>) {
  const { userId } = auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  const validatedData = StorySchema.parse(data);
  const { workspaceId } = validatedData;
  
  const canAccess = await hasAccessToWorkspace(userId, workspaceId);
  
  if (!canAccess) {
    redirect("/dashboard");
  }
  
  try {
    const story = await db.story.create({
      data: {
        ...validatedData,
        creatorId: userId,
      },
    });
    
    revalidatePath(`/workspace/${workspaceId}`);
    
    return story;
  } catch (error) {
    console.error("Error creating story:", error);
    throw new Error("Failed to create story");
  }
}

// Update a story
export async function updateStory({
  id,
  ...data
}: z.infer<typeof StorySchema> & { id: string }) {
  const { userId } = auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  try {
    const story = await db.story.findUnique({
      where: {
        id,
      },
    });
    
    if (!story) {
      throw new Error("Story not found");
    }
    
    const canAccess = await hasAccessToWorkspace(userId, story.workspaceId);
    
    if (!canAccess) {
      redirect("/dashboard");
    }
    
    const updatedStory = await db.story.update({
      where: {
        id,
      },
      data,
    });
    
    revalidatePath(`/workspace/${story.workspaceId}`);
    
    return updatedStory;
  } catch (error) {
    console.error("Error updating story:", error);
    throw new Error("Failed to update story");
  }
}

// Delete a story
export async function deleteStory({ id }: { id: string }) {
  const { userId } = auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  try {
    const story = await db.story.findUnique({
      where: {
        id,
      },
    });
    
    if (!story) {
      throw new Error("Story not found");
    }
    
    const canAccess = await hasAccessToWorkspace(userId, story.workspaceId);
    
    if (!canAccess) {
      redirect("/dashboard");
    }
    
    await db.story.delete({
      where: {
        id,
      },
    });
    
    revalidatePath(`/workspace/${story.workspaceId}`);
    
    return story;
  } catch (error) {
    console.error("Error deleting story:", error);
    throw new Error("Failed to delete story");
  }
} 