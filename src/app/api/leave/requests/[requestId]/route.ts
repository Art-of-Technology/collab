import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { processLeaveRequestAction } from "@/lib/leave-service";
import { z } from "zod";

const updateLeaveRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
});

/**
 * PATCH /api/leave/requests/[requestId] - Update leave request status (approve/reject)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = params;
    const body = await req.json();
    const validated = updateLeaveRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validated.error.format(),
        },
        { status: 400 }
      );
    }

    const { status, notes } = validated.data;

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Use the centralized service to handle approval/rejection with balance updates
    // This includes all permission checks, validation, and balance updates
    const updatedRequest = await processLeaveRequestAction({
      requestId,
      action: status,
      notes,
      actionById: user.id,
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error updating leave request:", error);
    return NextResponse.json(
      { error: "Failed to update leave request" },
      { status: 500 }
    );
  }
}
