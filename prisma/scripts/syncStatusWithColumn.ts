import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔄 Syncing status with column names...");

    // Tasks
    const tasks = await prisma.task.findMany({
        where: { columnId: { not: null } },
        include: { column: true },
    });

    for (const task of tasks) {
        if (task.column && task.status !== task.column.name) {
            await prisma.task.update({
                where: { id: task.id },
                data: { status: task.column.name },
            });
            console.log(`✅ Updated Task ${task.id} status to "${task.column.name}"`);
        }
    }

    // Milestones
    const milestones = await prisma.milestone.findMany({
        where: { columnId: { not: null } },
        include: { column: true },
    });

    for (const milestone of milestones) {
        if (milestone.column && milestone.status !== milestone.column.name) {
            await prisma.milestone.update({
                where: { id: milestone.id },
                data: { status: milestone.column.name },
            });
            console.log(`✅ Updated Milestone ${milestone.id} status to "${milestone.column.name}"`);
        }
    }

    // Epics
    const epics = await prisma.epic.findMany({
        where: { columnId: { not: null } },
        include: { column: true },
    });

    for (const epic of epics) {
        if (epic.column && epic.status !== epic.column.name) {
            await prisma.epic.update({
                where: { id: epic.id },
                data: { status: epic.column.name },
            });
            console.log(`✅ Updated Epic ${epic.id} status to "${epic.column.name}"`);
        }
    }

    // Stories
    const stories = await prisma.story.findMany({
        where: { columnId: { not: null } },
        include: { column: true },
    });

    for (const story of stories) {
        if (story.column && story.status !== story.column.name) {
            await prisma.story.update({
                where: { id: story.id },
                data: { status: story.column.name },
            });
            console.log(`✅ Updated Story ${story.id} status to "${story.column.name}"`);
        }
    }

    console.log("🎉 Status synchronization complete.");
}

main()
    .catch((e) => {
        console.error("❌ Error syncing statuses:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
