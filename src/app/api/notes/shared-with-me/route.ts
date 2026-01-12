import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteType } from "@prisma/client";

// GET - List all notes shared with the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const type = searchParams.get("type") as NoteType | null;
    const workspaceId = searchParams.get("workspace");

    const where: any = {
      sharedWith: {
        some: {
          userId: session.user.id
        }
      },
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { content: { contains: search, mode: "insensitive" as const } }
        ]
      }),
      ...(type && { type }),
      ...(workspaceId && { workspaceId })
    };

    const notes = await prisma.note.findMany({
      where,
      include: {
        tags: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        sharedWith: {
          where: {
            userId: session.user.id
          },
          select: {
            id: true,
            permission: true,
            sharedAt: true,
            sharer: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        },
        comments: {
          select: {
            id: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error fetching shared notes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
