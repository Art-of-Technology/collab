import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

type EntityType = 'task' | 'epic' | 'story' | 'milestone';

interface ParsedDocumentId {
  type: EntityType;
  entityId: string;
  field: string;
}

interface EntityPermissionCheck {
  entity: any;
  workspaceId: string;
}

// Enhanced document ID parsing with validation
function parseDocumentId(documentId: string): ParsedDocumentId | null {
  const match = documentId.match(/^(task|epic|story|milestone):([^:]+):(.+)$/);
  if (!match) return null;
  
  const [, type, entityId, field] = match;
  
  // Validate entity type
  if (!['task', 'epic', 'story', 'milestone'].includes(type)) return null;
  
  // Validate field (security constraint)
  if (field !== 'description') return null;
  
  // Basic ID validation
  if (!entityId || entityId.length < 1 || entityId.length > 100) return null;
  
  return { type: type as EntityType, entityId, field };
}

// Generic permission check for all entity types
async function checkEntityPermission(
  type: EntityType, 
  entityId: string, 
  userId: string
): Promise<EntityPermissionCheck | null> {
  try {
    let entity;
    let workspaceId: string;

    switch (type) {
      case 'task':
        entity = await prisma.task.findUnique({
          where: { id: entityId },
          include: { taskBoard: { include: { workspace: true } } }
        });
        if (!entity) return null;
        workspaceId = entity.taskBoard.workspaceId;
        break;

      case 'epic':
        entity = await prisma.epic.findUnique({
          where: { id: entityId },
          include: { workspace: true }
        });
        if (!entity) return null;
        workspaceId = entity.workspaceId;
        break;

      case 'story':
        entity = await prisma.story.findUnique({
          where: { id: entityId },
          include: { epic: { include: { workspace: true } } }
        });
        if (!entity) return null;
        workspaceId = entity.epic.workspaceId;
        break;

      case 'milestone':
        entity = await prisma.milestone.findUnique({
          where: { id: entityId },
          include: { workspace: true }
        });
        if (!entity) return null;
        workspaceId = entity.workspaceId;
        break;

      default:
        return null;
    }

    // Check workspace membership
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId
      }
    });

    if (!workspaceMember) return null;

    return { entity, workspaceId };
  } catch (error) {
    console.error(`[API] Permission check error for ${type}:${entityId}:`, error);
    return null;
  }
}

// Generic entity update function
async function updateEntity(
  type: EntityType,
  entityId: string,
  content: string
): Promise<{ id: string; description: string } | null> {
  try {
    const updateData = { description: content };
    const selectData = { id: true, description: true };

    switch (type) {
      case 'task':
        return await prisma.task.update({
          where: { id: entityId },
          data: updateData,
          select: selectData
        });

      case 'epic':
        return await prisma.epic.update({
          where: { id: entityId },
          data: updateData,
          select: selectData
        });

      case 'story':
        return await prisma.story.update({
          where: { id: entityId },
          data: updateData,
          select: selectData
        });

      case 'milestone':
        return await prisma.milestone.update({
          where: { id: entityId },
          data: updateData,
          select: selectData
        });

      default:
        return null;
    }
  } catch (error) {
    console.error(`[API] Update error for ${type}:${entityId}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let documentId: string;
  
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Request validation
    const body = await request.json();
    const { documentId: reqDocId, content } = body;
    documentId = reqDocId;

    if (!documentId || content === undefined) {
      return NextResponse.json(
        { error: "Document ID and content are required" },
        { status: 400 }
      );
    }

    // Content length validation (prevent excessive content)
    if (typeof content !== 'string' || content.length > 1000000) { // 1MB limit
      return NextResponse.json(
        { error: "Content must be a string and under 1MB" },
        { status: 400 }
      );
    }

    // Parse and validate document ID
    const parsed = parseDocumentId(documentId);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }

    const { type, entityId } = parsed;

    // Check permissions
    const permissionCheck = await checkEntityPermission(type, entityId, session.user.id);
    if (!permissionCheck) {
      return NextResponse.json(
        { error: `${type.charAt(0).toUpperCase() + type.slice(1)} not found or access denied` },
        { status: 404 }
      );
    }

    // Update the entity
    const updateResult = await updateEntity(type, entityId, content);
    if (!updateResult) {
      return NextResponse.json(
        { error: "Failed to update document" },
        { status: 500 }
      );
    }

    console.log(`[API] Saved ${documentId} by user ${session.user.id}`);

    return NextResponse.json({ 
      success: true, 
      message: "Document saved successfully",
      data: updateResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[API] Error saving document ${documentId || 'unknown'}:`, error);
    
    // More specific error responses
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}