'use server'

import { getCurrentUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { postWorkspaceAccessWhere } from '@/lib/post-access'

export async function getProjectStatuses(projectIds: string[]) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('Unauthorized')
    if (projectIds.length === 0) return []

    return await prisma.projectStatus.findMany({
      where: {
        projectId: { in: projectIds },
        project: { workspace: postWorkspaceAccessWhere(user.id) }
      },
      orderBy: [
        { order: 'asc' },
        { name: 'asc' }
      ]
    })
  } catch (error) {
    throw new Error('Failed to fetch project statuses. Please try again.')
  }
}
