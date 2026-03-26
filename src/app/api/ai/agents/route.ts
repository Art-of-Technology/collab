import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAllAgents } from "@/lib/ai";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agents = await getAllAgents(prisma);

    return NextResponse.json({
      agents: agents.map((agent) => ({
        slug: agent.slug,
        name: agent.name,
        avatar: agent.avatar,
        color: agent.color,
        description: agent.description,
        personality: agent.personality,
        capabilities: agent.capabilities,
        isDefault: agent.isDefault,
      })),
    });
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
