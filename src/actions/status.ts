'use server'

import { getAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getProjectStatuses(projectIds: string[]) {
  try {
    // Authentication check
    const session = await getAuthSession()
    if (!session?.user?.email) {
      throw new Error('Unauthorized - Please sign in to access project statuses')
    }

    // Input validation
    if (!projectIds) {
      throw new Error('Project IDs are required')
    }

    if (!Array.isArray(projectIds)) {
      throw new Error('Project IDs must be an array')
    }

    if (projectIds.length === 0) {
      return []
    }

    // Validate project ID format (assuming they are UUIDs or similar)
    const invalidIds = projectIds.filter(id => !id || typeof id !== 'string' || id.trim().length === 0)
    if (invalidIds.length > 0) {
      throw new Error('Invalid project ID format detected')
    }

    // Get the current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Verify user has access to the requested projects
    const accessibleProjects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        workspace: {
          OR: [
            { ownerId: user.id },
            { members: { some: { userId: user.id } } }
          ]
        }
      },
      select: { id: true }
    })

    const accessibleProjectIds = accessibleProjects.map(p => p.id)

    // Only return statuses for projects the user has access to
    if (accessibleProjectIds.length === 0) {
      return []
    }

    const statuses = await prisma.projectStatus.findMany({
      where: { 
        projectId: { in: accessibleProjectIds } 
      },
      orderBy: [
        { order: 'asc' },
        { name: 'asc' }
      ]
    })

    return statuses

  } catch (error) {
    // Log the error for debugging (in production, use proper logging)
    console.error('Error in getProjectStatuses:', error)
    
    // Re-throw known errors with user-friendly messages
    if (error instanceof Error) {
      throw error
    }
    
    // Handle unexpected errors
    throw new Error('Failed to fetch project statuses. Please try again.')
  }
}