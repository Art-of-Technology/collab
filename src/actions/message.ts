 'use server';

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get all conversations for current user
 */
export async function getUserConversations() {
  const session = await getAuthSession();
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get user with conversations
  const userWithConversations = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    include: {
      conversations: {
        include: {
          participants: {
            where: {
              id: {
                not: session.user.id
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
            include: {
              sender: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      }
    }
  });
  
  const conversations = userWithConversations?.conversations || [];
  
  // Count unread messages for each conversation
  const conversationsWithCounts = await Promise.all(
    conversations.map(async (conversation) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          receiverId: session.user.id,
          read: false
        }
      });
      
      return {
        ...conversation,
        unreadCount
      };
    })
  );
  
  return conversationsWithCounts;
}

/**
 * Get a conversation by ID
 */
export async function getConversationById(conversationId: string) {
  const session = await getAuthSession();
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Verify the user is part of the conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: {
        some: {
          id: session.user.id
        }
      }
    },
    include: {
      participants: true,
      messages: {
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      }
    }
  });
  
  if (!conversation) {
    return null;
  }
  
  // Mark unread messages as read
  await prisma.message.updateMany({
    where: {
      conversationId,
      receiverId: session.user.id,
      read: false
    },
    data: {
      read: true
    }
  });
  
  // Find the other participant
  const otherParticipant = conversation.participants.find(
    participant => participant.id !== session.user.id
  );
  
  if (!otherParticipant) {
    return null;
  }
  
  return {
    ...conversation,
    otherParticipant
  };
}

/**
 * Send a message
 */
export async function sendMessage(conversationId: string, content: string) {
  const session = await getAuthSession();
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  if (!content || content.trim() === '') {
    throw new Error('Message content is required');
  }
  
  // Verify the user is part of the conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: {
        some: {
          id: session.user.id
        }
      }
    },
    include: {
      participants: true
    }
  });
  
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  
  // Find the recipient (the other participant)
  const recipient = conversation.participants.find(
    participant => participant.id !== session.user.id
  );
  
  if (!recipient) {
    throw new Error('Recipient not found');
  }
  
  // Create the message
  const message = await prisma.message.create({
    data: {
      content: content.trim(),
      conversationId,
      senderId: session.user.id,
      receiverId: recipient.id
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          image: true
        }
      }
    }
  });
  
  // Update the conversation's updatedAt timestamp
  await prisma.conversation.update({
    where: {
      id: conversationId
    },
    data: {
      updatedAt: new Date()
    }
  });
  
  return message;
}

/**
 * Get all users for starting a new conversation
 */
export async function getUsersForNewConversation() {
  const session = await getAuthSession();
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get all users except the current user
  const users = await prisma.user.findMany({
    where: {
      id: {
        not: session.user.id
      }
    },
    orderBy: {
      name: 'asc'
    },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      team: true
    }
  });
  
  return users;
}

/**
 * Create a new conversation or return existing one
 */
export async function createOrGetConversation(otherUserId: string) {
  const session = await getAuthSession();
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Check if a conversation already exists between these users
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        {
          participants: {
            some: {
              id: session.user.id
            }
          }
        },
        {
          participants: {
            some: {
              id: otherUserId
            }
          }
        }
      ]
    }
  });
  
  if (existingConversation) {
    return existingConversation.id;
  }
  
  // Create a new conversation
  const newConversation = await prisma.conversation.create({
    data: {
      participants: {
        connect: [
          { id: session.user.id },
          { id: otherUserId }
        ]
      }
    }
  });
  
  return newConversation.id;
}