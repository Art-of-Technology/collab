import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NoteScope, NoteSharePermission } from "@prisma/client";
import {
  encryptVariables,
  encryptRawContent,
  decryptVariables,
  decryptRawContent,
  isSecretNoteType,
  isSecretsEnabled,
  SecretVariable
} from "@/lib/secrets/crypto";
import { logNoteAccess, canAccessNote } from "@/lib/secrets/access";
import { createVersion, hasSignificantChange, detectChangeType } from "@/lib/versioning";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const note = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          // User's own notes
          { authorId: session.user.id },
          // Workspace-visible notes
          { scope: NoteScope.WORKSPACE },
          // Project-visible notes
          { scope: NoteScope.PROJECT },
          // Public notes
          { scope: NoteScope.PUBLIC },
          // Notes shared with the user
          { sharedWith: { some: { userId: session.user.id } } }
        ]
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
            sharedBy: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        }
      }
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Add computed permission for the current user
    const isOwner = note.authorId === session.user.id;
    const shareRecord = note.sharedWith.find(s => s.userId === session.user.id);
    const canEdit = isOwner || shareRecord?.permission === NoteSharePermission.EDIT;

    // Decrypt secrets if this is a secret note type
    let decryptedVariables = null;
    let decryptedRawContent = null;

    if (isSecretNoteType(note.type) && note.isEncrypted && note.workspaceId) {
      try {
        // Decrypt variables (key-value mode)
        if (note.secretVariables) {
          const encryptedVars = JSON.parse(note.secretVariables) as SecretVariable[];
          const decrypted = decryptVariables(encryptedVars, note.workspaceId);
          // Convert to format expected by frontend
          decryptedVariables = decrypted.map(v => ({
            key: v.key,
            value: v.value,
            masked: v.masked
          }));
        }

        // Decrypt raw content (.env mode)
        if (note.encryptedContent) {
          decryptedRawContent = decryptRawContent(note.encryptedContent, note.workspaceId);
        }
      } catch (decryptError) {
        console.error("Error decrypting secrets:", decryptError);
        // Don't fail the request, just don't return decrypted data
      }
    }

    return NextResponse.json({
      ...note,
      // Include decrypted data for the frontend
      decryptedVariables,
      decryptedRawContent,
      _permissions: {
        isOwner,
        canEdit,
        canDelete: isOwner,
        canShare: isOwner
      }
    });
  } catch (error) {
    console.error("Error fetching note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      content,
      isFavorite,
      tagIds,
      // New Knowledge System fields
      type,
      scope,
      projectId,
      isAiContext,
      aiContextPriority,
      category,
      // Legacy support
      isPublic,
      // Secrets Vault Phase 3 fields
      variables, // Array of { key, value, masked?, description? }
      rawSecretContent, // Raw .env content
      isRestricted, // Limit access even for PROJECT/WORKSPACE scope
      expiresAt, // Optional expiration for secrets
      // Versioning session tracking
      sessionVersion, // Version when editing session started - used to update existing version instead of creating new
    } = body;

    // Check if note exists and user has permission to edit
    const existingNote = await prisma.note.findFirst({
      where: {
        id: id,
        OR: [
          // Owner can always edit
          { authorId: session.user.id },
          // Users with EDIT permission can edit
          {
            sharedWith: {
              some: {
                userId: session.user.id,
                permission: NoteSharePermission.EDIT
              }
            }
          }
        ]
      },
      include: {
        sharedWith: {
          where: { userId: session.user.id },
          select: { permission: true }
        }
      },
      // Include versioning-related fields
    });

    // Also get the full note content for versioning
    const noteForVersioning = await prisma.note.findUnique({
      where: { id },
      select: {
        title: true,
        content: true,
        version: true,
        versioningEnabled: true,
      }
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found or no permission to edit" }, { status: 404 });
    }

    const isOwner = existingNote.authorId === session.user.id;

    // Non-owners cannot change scope, type, or sharing settings
    if (!isOwner && (scope !== undefined || type !== undefined)) {
      return NextResponse.json(
        { error: "Only the owner can change note type or scope" },
        { status: 403 }
      );
    }

    // Validate project exists if projectId is being set
    if (projectId) {
      const projectExists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      });

      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 400 }
        );
      }
    }

    // Handle scope conversion from legacy isPublic
    let finalScope = scope;
    if (!scope && isPublic !== undefined && isOwner) {
      finalScope = isPublic ? NoteScope.WORKSPACE : NoteScope.PERSONAL;
    }

    // Validate scope requirements
    if (finalScope === NoteScope.PROJECT && !projectId && !existingNote.projectId) {
      return NextResponse.json(
        { error: "Project ID is required for PROJECT scope notes" },
        { status: 400 }
      );
    }

    // Handle secrets encryption for secret note types
    const noteType = type !== undefined ? type : existingNote.type;
    const isSecretType = isSecretNoteType(noteType);
    const workspaceId = existingNote.workspaceId;
    let encryptedData: {
      isEncrypted?: boolean;
      encryptedContent?: string | null;
      secretVariables?: string | null;
    } = {};

    if (isSecretType && (variables !== undefined || rawSecretContent !== undefined)) {
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
      if (variables !== undefined) {
        if (Array.isArray(variables) && variables.length > 0) {
          const encrypted = encryptVariables(variables, workspaceId);
          encryptedData.secretVariables = JSON.stringify(encrypted);
        } else {
          encryptedData.secretVariables = null;
        }
      }

      // Encrypt raw content (.env mode)
      if (rawSecretContent !== undefined) {
        if (typeof rawSecretContent === 'string' && rawSecretContent.trim()) {
          encryptedData.encryptedContent = encryptRawContent(rawSecretContent, workspaceId);
        } else {
          encryptedData.encryptedContent = null;
        }
      }
    }

    // Create a version before updating (if versioning is enabled and content changed)
    const shouldCreateVersion =
      noteForVersioning?.versioningEnabled &&
      !isSecretType && // Don't version secret notes (they have separate audit logging)
      (title !== undefined || content !== undefined);

    if (shouldCreateVersion && noteForVersioning) {
      const newTitle = title !== undefined ? title : noteForVersioning.title;
      const newContent = content !== undefined ? content : noteForVersioning.content;

      // Only create version if there's a significant change
      if (hasSignificantChange(
        noteForVersioning.content,
        newContent,
        noteForVersioning.title,
        newTitle
      )) {
        try {
          await createVersion({
            noteId: id,
            title: newTitle,
            content: newContent,
            authorId: session.user.id,
            changeType: detectChangeType(
              noteForVersioning.title,
              newTitle,
              noteForVersioning.content,
              newContent
            ),
            // Pass sessionVersion to enable same-session version updates
            // If sessionVersion is provided and a version was already created in this session,
            // the existing version will be updated instead of creating a new one
            sessionVersion: typeof sessionVersion === 'number' ? sessionVersion : undefined,
          });
        } catch (versionError) {
          // Log but don't fail the update if versioning fails
          console.error("Error creating version:", versionError);
        }
      }
    }

    const note = await prisma.note.update({
      where: {
        id: id
      },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && !isSecretType && { content }),
        ...(isFavorite !== undefined && { isFavorite }),
        // Only owner can update these fields
        ...(isOwner && type !== undefined && { type }),
        ...(isOwner && finalScope !== undefined && { scope: finalScope }),
        ...(isOwner && projectId !== undefined && {
          project: projectId ? { connect: { id: projectId } } : { disconnect: true }
        }),
        ...(isOwner && isAiContext !== undefined && { isAiContext }),
        ...(isOwner && aiContextPriority !== undefined && { aiContextPriority }),
        // Secrets Vault Phase 3 fields (owner only)
        ...(isOwner && encryptedData.isEncrypted !== undefined && { isEncrypted: encryptedData.isEncrypted }),
        ...(isOwner && encryptedData.encryptedContent !== undefined && { encryptedContent: encryptedData.encryptedContent }),
        ...(isOwner && encryptedData.secretVariables !== undefined && { secretVariables: encryptedData.secretVariables }),
        ...(isOwner && isRestricted !== undefined && { isRestricted }),
        ...(isOwner && expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(tagIds && {
          tags: {
            set: tagIds.map((tagId: string) => ({ id: tagId }))
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
        }
      }
    });

    // Log update for encrypted notes
    if (note.isEncrypted && (encryptedData.secretVariables !== undefined || encryptedData.encryptedContent !== undefined)) {
      await logNoteAccess(
        note.id,
        session.user.id,
        'UPDATE',
        {
          updatedVariables: encryptedData.secretVariables !== undefined,
          updatedRawContent: encryptedData.encryptedContent !== undefined,
          isRestricted: note.isRestricted
        },
        request
      );
    }

    return NextResponse.json(note);
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if note exists and user owns it
    const existingNote = await prisma.note.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      }
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.note.delete({
      where: {
        id: id
      }
    });

    return NextResponse.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 