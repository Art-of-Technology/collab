import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteIncludeExtension } from '@/types/prisma-extensions';
import { NoteScope, NoteType } from "@prisma/client";
import {
  encryptVariables,
  encryptRawContent,
  isSecretNoteType,
  isSecretsEnabled
} from "@/lib/secrets/crypto";
import { logNoteAccess } from "@/lib/secrets/access";
import { createInitialVersion } from "@/lib/versioning";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const isFavorite = searchParams.get("favorite") === "true";
    const tagId = searchParams.get("tag");
    const workspaceId = searchParams.get("workspace");
    const projectId = searchParams.get("project");
    const scope = searchParams.get("scope") as NoteScope | null;
    const type = searchParams.get("type") as NoteType | null;
    const isAiContext = searchParams.get("aiContext") === "true";
    const sharedWithMe = searchParams.get("sharedWithMe") === "true";

    // Legacy support
    const isPublic = searchParams.get("public");
    const own = searchParams.get("own");

    // Build the base where clause
    const where: any = {
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { content: { contains: search, mode: "insensitive" as const } }
        ]
      }),
      ...(isFavorite && { isFavorite: true }),
      ...(tagId && { tags: { some: { id: tagId } } }),
      ...(type && { type }),
      ...(isAiContext && { isAiContext: true }),
    };

    // Handle shared with me filter
    if (sharedWithMe) {
      where.sharedWith = {
        some: {
          userId: session.user.id
        }
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
              permission: true,
              sharedAt: true
            }
          },
          comments: {
            select: {
              id: true
            }
          }
        } as NoteIncludeExtension,
        orderBy: {
          updatedAt: "desc"
        }
      });

      return NextResponse.json(notes);
    }

    // Handle scope-based filtering
    if (scope) {
      where.scope = scope;

      if (scope === NoteScope.PERSONAL) {
        where.authorId = session.user.id;
      } else if (scope === NoteScope.PROJECT && projectId) {
        where.projectId = projectId;
      } else if (scope === NoteScope.WORKSPACE && workspaceId) {
        where.workspaceId = workspaceId;
      }
      // PUBLIC scope - no additional filters needed
    } else if (own === "true") {
      // Legacy: User wants only their own notes
      where.authorId = session.user.id;

      if (isPublic === "true") {
        // My Workspace-visible notes (legacy public = workspace scope)
        where.scope = { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] };
      } else if (isPublic === "false") {
        // My Personal notes
        where.scope = NoteScope.PERSONAL;
      }

      if (workspaceId) {
        if (!where.AND) where.AND = [];
        where.AND.push({ workspaceId: workspaceId });
      }
    } else if (own === "false") {
      // Legacy: Team visible - workspace/project/public notes from others
      if (workspaceId) {
        where.AND = [
          { scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] } },
          { authorId: { not: session.user.id } },
          { workspaceId: workspaceId }
        ];
      } else {
        where.scope = { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC] };
        where.authorId = { not: session.user.id };
      }
    } else {
      // All Notes - everything user has access to based on scope
      const accessConditions: any[] = [
        // User's own notes (any scope)
        { authorId: session.user.id },
        // Workspace-visible notes in the same workspace
        ...(workspaceId ? [{ scope: NoteScope.WORKSPACE, workspaceId }] : []),
        // Project-visible notes (if user has access to the project)
        ...(projectId ? [{ scope: NoteScope.PROJECT, projectId }] : []),
        // Public notes
        { scope: NoteScope.PUBLIC },
        // Notes shared with the user
        { sharedWith: { some: { userId: session.user.id } } }
      ];

      if (workspaceId) {
        where.AND = [
          { OR: accessConditions },
          {
            OR: [
              { workspaceId: workspaceId },
              { workspaceId: null } // Include workspace-less notes (shared, etc.)
            ]
          }
        ];
      } else {
        where.OR = accessConditions;
      }
    }

    // Apply project filter if specified
    if (projectId && !scope) {
      if (!where.AND) where.AND = [];
      where.AND.push({ projectId });
    }

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
          select: {
            id: true,
            userId: true,
            permission: true,
            sharedAt: true,
            user: {
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
      } as NoteIncludeExtension,
      orderBy: [
        { aiContextPriority: "desc" },
        { updatedAt: "desc" }
      ]
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user exists in database
    const userExists = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true }
    });

    if (!userExists) {
      console.error("User not found in database:", session.user.id);
      return NextResponse.json(
        { error: "User not found. Please sign in again." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      title,
      content,
      isFavorite,
      workspaceId,
      tagIds,
      // New Knowledge System fields
      type,
      scope,
      projectId,
      isAiContext,
      aiContextPriority,
      // Legacy support
      isPublic,
      // Secrets Vault Phase 3 fields
      variables, // Array of { key, value, masked?, description? }
      rawSecretContent, // Raw .env content
      isRestricted, // Limit access even for PROJECT/WORKSPACE scope
      expiresAt // Optional expiration for secrets
    } = body;

    // For secret types, content can be empty (we use variables/rawSecretContent instead)
    const isSecretTypeRequest = type && isSecretNoteType(type as NoteType);

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!isSecretTypeRequest && !content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Validate project exists if projectId is provided
    if (projectId) {
      const projectExists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, workspaceId: true }
      });

      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 400 }
        );
      }
    }

    // Determine scope (with legacy support)
    let finalScope = scope || NoteScope.PERSONAL;
    if (!scope && isPublic !== undefined) {
      // Legacy: convert isPublic to scope
      finalScope = isPublic ? NoteScope.WORKSPACE : NoteScope.PERSONAL;
    }

    // Validate scope requirements
    if (finalScope === NoteScope.PROJECT && !projectId) {
      return NextResponse.json(
        { error: "Project ID is required for PROJECT scope notes" },
        { status: 400 }
      );
    }

    // Handle secrets encryption for secret note types
    const noteType = type || NoteType.GENERAL;
    const isSecretType = isSecretNoteType(noteType);
    let encryptedData: {
      isEncrypted: boolean;
      encryptedContent: string | null;
      secretVariables: string | null;
    } = {
      isEncrypted: false,
      encryptedContent: null,
      secretVariables: null
    };

    if (isSecretType && (variables || rawSecretContent)) {
      if (!workspaceId) {
        return NextResponse.json(
          { error: "Workspace ID is required for secret notes" },
          { status: 400 }
        );
      }

      if (!isSecretsEnabled()) {
        return NextResponse.json(
          { error: "Secrets feature is not enabled. SECRETS_MASTER_KEY is not configured." },
          { status: 503 }
        );
      }

      encryptedData.isEncrypted = true;

      // Encrypt variables (key-value mode)
      if (variables && Array.isArray(variables) && variables.length > 0) {
        const encrypted = encryptVariables(variables, workspaceId);
        encryptedData.secretVariables = JSON.stringify(encrypted);
      }

      // Encrypt raw content (.env mode)
      if (rawSecretContent && typeof rawSecretContent === 'string') {
        encryptedData.encryptedContent = encryptRawContent(rawSecretContent, workspaceId);
      }
    }

    const note = await prisma.note.create({
      data: {
        title,
        content: isSecretType ? "" : content, // Don't store plaintext for secrets
        isFavorite: isFavorite || false,
        authorId: session.user.id,
        workspaceId: workspaceId || null,
        // Knowledge System fields
        type: noteType,
        scope: finalScope,
        projectId: projectId || null,
        isAiContext: isAiContext || false,
        aiContextPriority: aiContextPriority || 0,
        // Secrets Vault Phase 3 fields
        isEncrypted: encryptedData.isEncrypted,
        encryptedContent: encryptedData.encryptedContent,
        secretVariables: encryptedData.secretVariables,
        isRestricted: isRestricted || false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        ...(tagIds && tagIds.length > 0 && {
          tags: {
            connect: tagIds.map((id: string) => ({ id }))
          }
        })
      },
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
          select: {
            id: true,
            userId: true,
            permission: true,
            sharedAt: true,
            user: {
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
      } as NoteIncludeExtension
    });

    // Log creation for encrypted notes
    if (encryptedData.isEncrypted) {
      await logNoteAccess(
        note.id,
        session.user.id,
        'CREATE',
        {
          type: noteType,
          hasVariables: !!encryptedData.secretVariables,
          hasRawContent: !!encryptedData.encryptedContent,
          isRestricted: isRestricted || false
        },
        request
      );
    }

    // Create initial version for non-secret notes (secrets have separate audit logging)
    if (!isSecretType) {
      try {
        await createInitialVersion({
          noteId: note.id,
          title,
          content,
          authorId: session.user.id,
        });
      } catch (versionError) {
        // Log but don't fail the creation if versioning fails
        console.error("Error creating initial version:", versionError);
      }
    }

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 