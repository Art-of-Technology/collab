import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function normalizePriorities() {
  try {
    console.log('Starting priority normalization...');

    // Check current distribution
    const distribution = await prisma.issue.groupBy({
      by: ['priority'],
      _count: true
    });
    console.log('Current priority distribution:', distribution);

    // Update 'medium' to 'MEDIUM'
    const mediumResult = await prisma.issue.updateMany({
      where: { priority: 'medium' },
      data: { priority: 'MEDIUM' }
    });
    console.log(`Updated ${mediumResult.count} 'medium' priorities to 'MEDIUM'`);

    // Update 'urgent' to 'URGENT'
    const urgentResult = await prisma.issue.updateMany({
      where: { priority: 'urgent' },
      data: { priority: 'URGENT' }
    });
    console.log(`Updated ${urgentResult.count} 'urgent' priorities to 'URGENT'`);

    // Update 'high' to 'HIGH'
    const highResult = await prisma.issue.updateMany({
      where: { priority: 'high' },
      data: { priority: 'HIGH' }
    });
    console.log(`Updated ${highResult.count} 'high' priorities to 'HIGH'`);

    // Update 'low' to 'LOW'
    const lowResult = await prisma.issue.updateMany({
      where: { priority: 'low' },
      data: { priority: 'LOW' }
    });
    console.log(`Updated ${lowResult.count} 'low' priorities to 'LOW'`);

    // Update 'critical' to 'CRITICAL'
    const criticalResult = await prisma.issue.updateMany({
      where: { priority: 'critical' },
      data: { priority: 'CRITICAL' }
    });
    console.log(`Updated ${criticalResult.count} 'critical' priorities to 'CRITICAL'`);

    // Check final distribution
    const finalDistribution = await prisma.issue.groupBy({
      by: ['priority'],
      _count: true
    });
    console.log('Final priority distribution:', finalDistribution);

    const totalUpdated = 
      mediumResult.count + 
      urgentResult.count + 
      highResult.count + 
      lowResult.count + 
      criticalResult.count;

    console.log(`\nTotal updates performed: ${totalUpdated}`);

  } catch (error) {
    console.error('Error normalizing priorities:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
normalizePriorities();