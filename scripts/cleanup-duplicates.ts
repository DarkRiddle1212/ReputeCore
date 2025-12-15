// Script to clean up duplicate token launches before migration
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  console.log("Starting duplicate cleanup...");

  try {
    // Find duplicates in TokenLaunch
    const duplicates = await prisma.$queryRaw<
      Array<{ token: string; creator: string; count: bigint }>
    >`
      SELECT token, creator, COUNT(*) as count
      FROM "TokenLaunch"
      GROUP BY token, creator
      HAVING COUNT(*) > 1
    `;

    console.log(
      `Found ${duplicates.length} duplicate token/creator combinations`
    );

    for (const dup of duplicates) {
      console.log(
        `Processing duplicates for token ${dup.token}, creator ${dup.creator}`
      );

      // Get all records for this token/creator combination
      const records = await prisma.$queryRaw<
        Array<{ id: number; createdAt: Date }>
      >`
        SELECT id, "createdAt"
        FROM "TokenLaunch"
        WHERE token = ${dup.token} AND creator = ${dup.creator}
        ORDER BY "createdAt" DESC
      `;

      // Keep the most recent one, delete the rest
      const toDelete = records.slice(1).map((r: { id: string }) => r.id);

      if (toDelete.length > 0) {
        await prisma.$executeRaw`
          DELETE FROM "TokenLaunch"
          WHERE id = ANY(${toDelete})
        `;
        console.log(`  Deleted ${toDelete.length} duplicate records`);
      }
    }

    console.log("Duplicate cleanup complete!");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupDuplicates();
