import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Get all conversations for the current user
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get all conversations for the current user with latest message and participants
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            id: currentUser.id
          }
        }
      },
      include: {
        participants: {
          where: {
            id: {
              not: currentUser.id
            }
          },
          select: {
            id: true,
            name: true,
            image: true,
            role: true
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            read: true,
            sender: {
              select: {
                id: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Count unread messages for each conversation
    const conversationsWithUnreadCount = await Promise.all(
      conversations.map(async (conversation) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            receiverId: currentUser.id,
            read: false
          }
        });
        
        return {
          ...conversation,
          unreadCount
        };
      })
    );
    
    return NextResponse.json(conversationsWithUnreadCount);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

// Create a new conversation or return existing one
export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { userId } = body;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    // Check if the user exists
    const recipient = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });
    
    if (!recipient) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Check if conversation already exists
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: {
                id: currentUser.id
              }
            }
          },
          {
            participants: {
              some: {
                id: userId
              }
            }
          }
        ]
      },
      include: {
        participants: true
      }
    });
    
    if (existingConversation) {
      return NextResponse.json(existingConversation);
    }
    
    // Create a new conversation
    const newConversation = await prisma.conversation.create({
      data: {
        participants: {
          connect: [
            { id: currentUser.id },
            { id: userId }
          ]
        }
      },
      include: {
        participants: true
      }
    });
    
    return NextResponse.json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
} 